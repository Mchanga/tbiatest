import pool from "../../../config/database.js";
import { insertAuditLog, type AuditRequestContext } from "../../../services/audit.service.js";



export interface VerifiedUser {
  uid: string;
  email: string;
  status: string;
  isVerified: boolean;
  accountActivated: boolean;
}



export const createEmailVerification = async (
  uid: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE uid = $1 AND deleted_at IS NULL FOR UPDATE",
      [uid]
    );

    if (user.rowCount !== 1) {
      throw new Error("User not found while creating email verification");
    }

    await client.query(
      `UPDATE email_verifications SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.rows[0].id]
    );
    await client.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.rows[0].id, tokenHash, expiresAt]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};



export const verifyEmailToken = async (
  tokenHash: string,
  auditContext: AuditRequestContext
): Promise<VerifiedUser | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const verification = await client.query<{
      id: string;
      user_id: string;
      uid: string;
      email: string;
      status: string;
      email_verified_at: Date | null;
    }>(
      `
      SELECT ev.id, ev.user_id, u.uid, u.email, u.status, u.email_verified_at
      FROM email_verifications ev
      INNER JOIN users u ON u.id = ev.user_id
      WHERE ev.token_hash = $1
        AND ev.used_at IS NULL
        AND ev.expires_at > NOW()
        AND u.deleted_at IS NULL
      LIMIT 1
      FOR UPDATE OF ev, u
      `,
      [tokenHash]
    );

    if (verification.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const record = verification.rows[0];
    const consumed = await client.query(
      `UPDATE email_verifications SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [record.id]
    );

    if (consumed.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const user = await client.query<{
      uid: string;
      email: string;
      status: string;
      is_verified: boolean;
    }>(
      `UPDATE users SET is_verified = TRUE,
         email_verified_at = COALESCE(email_verified_at, NOW()),
         status = CASE WHEN status = 'pending' THEN 'active' ELSE status END
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING uid, email, status, is_verified`,
      [record.user_id]
    );

    if (user.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    await insertAuditLog(client, {
      ...auditContext,
      actorUid: user.rows[0].uid,
      action: "auth.email_verified",
      entityType: "users",
      entityId: record.user_id,
      newValues: { email_verified: true, status: user.rows[0].status },
    });

    await client.query("COMMIT");
    const verifiedUser = user.rows[0];
    return {
      uid: verifiedUser.uid,
      email: verifiedUser.email,
      status: verifiedUser.status,
      isVerified: verifiedUser.is_verified,
      accountActivated: verifiedUser.status === "active",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};