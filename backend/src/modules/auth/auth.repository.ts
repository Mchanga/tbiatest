import pool from "../../config/database.js";
import { insertAuditLog } from "../../services/audit.service.js";
export type AccountType =
  | "business"
  | "entrepreneur"
  | "investor"
  | "startup"
  | "individual"
  | "institution";
export interface UserRecord {
  uid: string;
  role_id: number;
  role_ids: number[];
  account_type: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  status: string;
  is_verified: boolean;
  last_login_at: Date | null;
  created_at: Date;
}
export interface CreateUserData {
  account_type: AccountType;
  full_name: string;
  email: string;
  phone?: string;
  password_hash: string;
  accept_terms: boolean;
}
export const findUserByEmail = async (
  email: string
): Promise<UserRecord | null> => {
  const result = await pool.query<UserRecord>(
    `
    SELECT u.uid, u.role_id,
           COALESCE(ARRAY_AGG(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL),
                    ARRAY[u.role_id]::smallint[]) AS role_ids,
           u.account_type, u.full_name, u.email, u.phone, u.password_hash,
           u.status, u.is_verified, u.last_login_at, u.created_at
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.email = $1 AND u.deleted_at IS NULL
    GROUP BY u.id
    LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
};
export const findUserByUid = async (
  uid: string
): Promise<UserRecord | null> => {
  const result = await pool.query<UserRecord>(
    `
    SELECT u.uid, u.role_id,
           COALESCE(ARRAY_AGG(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL),
                    ARRAY[u.role_id]::smallint[]) AS role_ids,
           u.account_type, u.full_name, u.email, u.phone, u.password_hash,
           u.status, u.is_verified, u.last_login_at, u.created_at
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.uid = $1 AND u.deleted_at IS NULL
    GROUP BY u.id
    LIMIT 1
    `,
    [uid]
  );

  return result.rows[0] ?? null;
};
export const createUser = async (
  data: CreateUserData,
  auditContext: { requestId: string; ipAddress?: string; userAgent?: string }
): Promise<UserRecord> => {
  const roleSlug =
    data.account_type === "business"
      ? "registered_business"
      : "registered_individual";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<UserRecord & { id: string }>(
    `
    INSERT INTO users (
      role_id, account_type, full_name, email, phone, password_hash, accept_terms
    )
    SELECT id, $1, $2, $3, $4, $5, $6
    FROM roles
    WHERE slug = $7
    RETURNING id, uid, role_id, account_type, full_name, email, phone,
              password_hash, status, is_verified, last_login_at, created_at
    `,
    [
      data.account_type,
      data.full_name,
      data.email,
      data.phone ?? null,
      data.password_hash,
      data.accept_terms,
      roleSlug,
    ]
    );

    if (result.rowCount !== 1) {
      throw new Error(`Registration role '${roleSlug}' was not found in the database`);
    }

    const createdUser = result.rows[0];
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [createdUser.id, createdUser.role_id]
    );
    await insertAuditLog(client, {
      requestId: auditContext.requestId,
      actorUid: createdUser.uid,
      action: "users.create",
      entityType: "users",
      entityId: createdUser.id,
      newValues: {
        uid: createdUser.uid,
        account_type: createdUser.account_type,
        role_id: createdUser.role_id,
        accept_terms: data.accept_terms,
      },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    await client.query("COMMIT");
    const { id: _internalId, ...user } = createdUser;
    return { ...user, role_ids: [createdUser.role_id] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
export const updateLastLogin = async (
  uid: string,
  ipAddress: string
): Promise<void> => {
  await pool.query(
    `UPDATE users SET last_login_at = NOW(), last_login_ip = $2::inet,
       updated_at = NOW() WHERE uid = $1`,
    [uid, ipAddress]
  );
};
export const recordLoginAttempt = async (
  email: string,
  ipAddress: string,
  success: boolean,
  userAgent?: string
): Promise<void> => {
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, success, user_agent)
     VALUES ($1, $2::inet, $3, $4)`,
    [email, ipAddress, success, userAgent ?? null]
  );
};