import pool from "../../../config/database.js";
import { insertAuditLog, type AuditRequestContext } from "../../../services/audit.service.js";

export const createPasswordReset = async (
  email: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE password_resets SET used_at = NOW() WHERE email = $1 AND used_at IS NULL",
      [email]
    );
    await client.query(
      "INSERT INTO password_resets (email, token_hash, expires_at) VALUES ($1, $2, $3)",
      [email, tokenHash, expiresAt]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const consumePasswordReset = async (
  tokenHash: string,
  passwordHash: string,
  auditContext: AuditRequestContext
): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reset = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );

    if (reset.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    const user = await client.query<{ id: string; uid: string }>(
      "SELECT id, uid FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [reset.rows[0].email]
    );

    if (user.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    const userId = user.rows[0].id;
    const consumed = await client.query(
      `UPDATE password_resets SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [reset.rows[0].id]
    );

    if (consumed.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [passwordHash, userId]
    );
    await client.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [userId]
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid: user.rows[0].uid,
      action: "auth.password_reset",
      entityType: "users",
      entityId: userId,
      newValues: { password_changed: true, refresh_sessions_revoked: true },
    });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};