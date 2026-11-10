import pool from "../../../config/database.js";
import { insertAuditLog, type AuditRequestContext } from "../../../services/audit.service.js";

export interface RefreshUser {
  uid: string;
  role_id: number;
  role_ids: number[];
  account_type: string;
}

export const createRefreshToken = async (
  uid: string,
  tokenHash: string,
  familyId: string,
  expiresAt: Date,
  ipAddress: string,
  userAgent?: string
): Promise<void> => {
  const user = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE uid = $1 AND deleted_at IS NULL
     AND status = 'active' AND is_verified = TRUE`,
    [uid]
  );

  if (user.rowCount !== 1) {
    throw new Error("Unable to create refresh token for this account");
  }

  await pool.query(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, family_id, expires_at, created_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5::inet, $6)`,
    [user.rows[0].id, tokenHash, familyId, expiresAt, ipAddress, userAgent ?? null]
  );
};

export const rotateRefreshToken = async (
  currentHash: string,
  replacementHash: string,
  expiresAt: Date,
  ipAddress: string,
  userAgent: string | undefined,
  auditContext: AuditRequestContext
): Promise<RefreshUser | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();
    const result = await client.query<{
      id: string;
      user_id: string;
      family_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      uid: string;
      role_id: number;
      account_type: string | null;
      status: string;
      is_verified: boolean;
      deleted_at: Date | null;
    }>(
      `
      SELECT rt.id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
             u.uid, u.role_id, u.account_type, u.status, u.is_verified, u.deleted_at
      FROM refresh_tokens rt
      INNER JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1
      LIMIT 1
      FOR UPDATE OF rt, u
      `,
      [currentHash]
    );
    const token = result.rows[0];

    if (!token) {
      await client.query("ROLLBACK");
      return null;
    }

    const isUnavailable =
      token.revoked_at !== null ||
      token.expires_at.getTime() <= now.getTime() ||
      token.status !== "active" ||
      !token.is_verified ||
      token.deleted_at !== null;

    if (isUnavailable) {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1",
        [token.family_id]
      );
      if (token.revoked_at !== null) {
        await insertAuditLog(client, {
          ...auditContext,
          actorUid: token.uid,
          action: "auth.refresh_reuse_detected",
          entityType: "users",
          entityId: token.user_id,
          newValues: { outcome: "rejected", reason: "revoked_token_reuse" },
        });
      }
      await client.query("COMMIT");
      return null;
    }

    if (token.account_type === null) {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1",
        [token.family_id]
      );
      await client.query("COMMIT");
      return null;
    }

    const revoked = await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [token.id]
    );

    if (revoked.rowCount !== 1) {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1",
        [token.family_id]
      );
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `INSERT INTO refresh_tokens
         (user_id, token_hash, family_id, expires_at, created_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5::inet, $6)`,
      [token.user_id, replacementHash, token.family_id, expiresAt, ipAddress, userAgent ?? null]
    );

    const assignedRoles = await client.query<{ role_id: number }>(
      "SELECT role_id FROM user_roles WHERE user_id = $1 ORDER BY role_id",
      [token.user_id]
    );

    await insertAuditLog(client, {
      ...auditContext,
      actorUid: token.uid,
      action: "auth.refresh",
      entityType: "users",
      entityId: token.user_id,
      newValues: { outcome: "rotated" },
    });

    await client.query("COMMIT");

    return {
      uid: token.uid,
      role_id: token.role_id,
      role_ids: assignedRoles.rows.map((row) => row.role_id),
      account_type: token.account_type,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const revokeRefreshToken = async (
  tokenHash: string,
  auditContext: AuditRequestContext
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const token = await client.query<{ id: string; user_id: string; uid: string }>(
      `SELECT rt.id, rt.user_id, u.uid FROM refresh_tokens rt
       INNER JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 FOR UPDATE OF rt`,
      [tokenHash]
    );

    if (token.rowCount === 1) {
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1",
        [token.rows[0].id]
      );
      await insertAuditLog(client, {
        ...auditContext,
        actorUid: token.rows[0].uid,
        action: "auth.logout",
        entityType: "users",
        entityId: token.rows[0].user_id,
        newValues: { refresh_session_revoked: true },
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};