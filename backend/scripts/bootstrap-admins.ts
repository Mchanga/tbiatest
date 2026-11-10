import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { z } from "zod";

import pool from "../src/config/database.js";
import { insertAuditLog } from "../src/services/audit.service.js";

const expectedDatabase = "tbia_db";
const accounts = [
  { roleSlug: "super_admin", label: "Super Admin" },
  { roleSlug: "website_admin", label: "Website Admin" },
] as const;

const chooseAccounts = async () => {
  const choice = await prompt(
    "Choose admin account to bootstrap:\n1) Super Admin\n2) Website Admin\n3) Both\nSelection: "
  );
  if (choice === "1") return [accounts[0]];
  if (choice === "2") return [accounts[1]];
  if (choice === "3") return accounts;
  throw new Error("Choose 1, 2, or 3");
};

const prompt = async (message: string): Promise<string> => {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return (await terminal.question(message)).trim();
  } finally {
    terminal.close();
  }
};

const promptSecret = async (message: string): Promise<string> => {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal to enter passwords securely");
  }

  stdout.write(message);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer): void => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Password entry cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    stdin.on("data", onData);
  });
};

const readAccount = async (roleLabel: string) => {
  const email = z.string().trim().email().max(254).safeParse(
    (await prompt(`${roleLabel} email: `)).toLowerCase()
  );
  if (!email.success) throw new Error(`Invalid email for ${roleLabel}`);

  const phoneInput = await prompt(`${roleLabel} phone number (optional): `);
  const phone = phoneInput
    ? z.string().trim().min(7).max(30).safeParse(phoneInput)
    : { success: true as const, data: null };
  if (!phone.success) throw new Error(`Phone number for ${roleLabel} must be 7-30 characters`);

  const existing = await pool.query<{ deleted_at: Date | null }>(
    "SELECT deleted_at FROM users WHERE email = $1",
    [email.data]
  );
  if (existing.rowCount) {
    if (existing.rows[0].deleted_at) {
      throw new Error(`A deleted account already uses ${email.data}; resolve it manually`);
    }
  }

  let fullName: string | null = null;
  if (!existing.rowCount) {
    fullName = await prompt(`${roleLabel} full name: `);
    if (fullName.length < 2 || fullName.length > 150) {
      throw new Error(`Full name for ${roleLabel} must be 2-150 characters`);
    }
    const acceptedTerms = (await prompt(`${roleLabel} account holder accepted the terms? Type yes: `))
      .toLowerCase();
    if (acceptedTerms !== "yes") {
      throw new Error(`Cannot create ${roleLabel} without confirmation that the account holder accepted the terms`);
    }
  }

  const password = await promptSecret(`${roleLabel} password (input hidden): `);
  const confirmation = await promptSecret(`${roleLabel} confirm password (input hidden): `);
  if (password.length < 8 || password.length > 64 || password !== confirmation) {
    throw new Error(`Password for ${roleLabel} must be 8-64 characters and match its confirmation`);
  }

  return {
    email: email.data,
    phone: phone.data,
    fullName,
    password,
  };
};

const bootstrapAdmins = async (): Promise<void> => {
  let client;
  try {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Admin bootstrap is disabled when NODE_ENV=production");
    }
    if (process.env.DB_NAME !== expectedDatabase) {
      throw new Error(`Admin bootstrap is restricted to DB_NAME=${expectedDatabase}`);
    }

    const confirmation = await prompt(
      `Confirm this is the staging database by typing "staging ${expectedDatabase}": `
    );
    if (confirmation !== `staging ${expectedDatabase}`) {
      throw new Error("Staging database confirmation did not match");
    }

    const database = await pool.query<{ name: string }>("SELECT current_database() AS name");
    if (database.rows[0]?.name !== expectedDatabase) {
      throw new Error("Connected database does not match the confirmed staging database");
    }

    const selectedAccounts = await chooseAccounts();
    const accountsToPrepare = [];
    for (const account of selectedAccounts) {
      const prepared = await readAccount(account.label);
      accountsToPrepare.push({ ...account, ...prepared });
    }
    if (new Set(accountsToPrepare.map((account) => account.email)).size !== selectedAccounts.length) {
      throw new Error("The Super Admin and Website Admin must use different email addresses");
    }
    if (new Set(accountsToPrepare.map((account) => account.password)).size !== selectedAccounts.length) {
      throw new Error("Use different passwords for the Super Admin and Website Admin");
    }
    const preparedAccounts = await Promise.all(
      accountsToPrepare.map(async ({ password, ...account }) => ({
        ...account,
        passwordHash: await bcrypt.hash(password, 12),
      }))
    );

    client = await pool.connect();
    await client.query("BEGIN");

    const roleResult = await client.query<{ id: number; slug: string }>(
      "SELECT id, slug FROM roles WHERE slug = ANY($1::varchar[])",
      [selectedAccounts.map((account) => account.roleSlug)]
    );
    const roleIds = new Map(roleResult.rows.map((role) => [role.slug, role.id]));
    for (const roleSlug of selectedAccounts.map((account) => account.roleSlug)) {
      if (!roleIds.has(roleSlug)) throw new Error(`Required role '${roleSlug}' is missing`);
    }

    for (const account of preparedAccounts) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [account.email]);
      const existing = await client.query<{
        id: string;
        uid: string;
        deleted_at: Date | null;
      }>(
        "SELECT id, uid, deleted_at FROM users WHERE email = $1 FOR UPDATE",
        [account.email]
      );

      if (existing.rowCount && existing.rows[0].deleted_at) {
        throw new Error(`A deleted account already uses ${account.email}; resolve it manually`);
      }

      const roleId = roleIds.get(account.roleSlug)!;
      let userId: string;
      let uid: string;
      let action: string;
      let oldRoles: string[] = [];

      if (existing.rowCount) {
        userId = existing.rows[0].id;
        uid = existing.rows[0].uid;
        action = "users.bootstrap_admin_promoted";
        const currentRoles = await client.query<{ slug: string }>(
          `SELECT r.slug
           FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = $1
           ORDER BY r.slug`,
          [userId]
        );
        oldRoles = currentRoles.rows.map((role) => role.slug);
        await client.query(
          `UPDATE users
           SET role_id = $2, password_hash = $3, phone = COALESCE($4, phone),
               status = 'active', is_verified = TRUE,
               email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [userId, roleId, account.passwordHash, account.phone]
        );
      } else {
        if (!account.fullName) {
          throw new Error(`Account ${account.email} was added while bootstrap was running; rerun the command`);
        }
        const created = await client.query<{ id: string; uid: string }>(
          `INSERT INTO users (
             role_id, account_type, full_name, email, phone, password_hash, accept_terms,
             status, is_verified, email_verified_at
           )
           VALUES ($1, 'individual', $2, $3, $4, $5, TRUE, 'active', TRUE, NOW())
           RETURNING id, uid`,
          [roleId, account.fullName, account.email, account.phone, account.passwordHash]
        );
        userId = created.rows[0].id;
        uid = created.rows[0].uid;
        action = "users.bootstrap_admin_created";
      }

      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleId]
      );
      await insertAuditLog(client, {
        requestId: crypto.randomUUID(),
        action,
        entityType: "users",
        entityId: userId,
        oldValues: existing.rowCount ? { roles: oldRoles } : null,
        newValues: { uid, email: account.email, role: account.roleSlug, status: "active", verified: true },
      });

      console.log(`${account.label} ready: ${account.email} (${uid})`);
      if (existing.rowCount) console.log("Existing account promoted and its password updated.");
    }

    await client.query("COMMIT");
    console.log("Admin bootstrap completed.");
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
};

void bootstrapAdmins().catch((error: unknown) => {
  console.error("Admin bootstrap failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
