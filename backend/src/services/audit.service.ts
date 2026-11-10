import type { PoolClient } from "pg";
import pool from "../config/database.js";

export interface AuditRequestContext {
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogEntry extends AuditRequestContext {
  action: string;
  actorUid?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|card|cvv/i;

const safeJson = (value: Record<string, unknown> | null | undefined): string | null => {
  if (!value) return null;

  return JSON.stringify(value, (key, entry: unknown) => {
    if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
    if (typeof entry === "bigint") return entry.toString();
    return entry;
  });
};

export const insertAuditLog = async (
  client: PoolClient,
  entry: AuditLogEntry
): Promise<void> => {
  let actorId: string | null = null;

  if (entry.actorUid) {
    const actor = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE uid = $1",
      [entry.actorUid]
    );

    if (!actor.rows[0]) {
      throw new Error("Audit actor was not found");
    }

    actorId = actor.rows[0].id;
  }

  await client.query(
    `INSERT INTO audit_logs (
       user_id, action, entity_type, entity_id, old_values, new_values,
       ip_address, user_agent, request_id
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet, $8, $9)`,
    [
      actorId,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      safeJson(entry.oldValues),
      safeJson(entry.newValues),
      entry.ipAddress ?? null,
      entry.userAgent?.slice(0, 255) ?? null,
      entry.requestId,
    ]
  );
};

export const writeAuditLog = async (entry: AuditLogEntry): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await insertAuditLog(client, entry);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};