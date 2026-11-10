import pool from "../../config/database.js";
import {
  insertAuditLog,
  type AuditRequestContext,
} from "../../services/audit.service.js";
import type {
  BusinessSearchQuery,
  CreateBusinessInput,
  UpdateBusinessInput,
} from "./businesses.validation.js";

export interface BusinessProfile {
  id: string;
  owner_uid: string;
  owner_name: string;
  owner_email: string;
  organisation_name: string;
  sector: string | null;
  registration_number: string | null;
  tin: string | null;
  website: string | null;
  description: string | null;
  logo_path: string | null;
  country: string;
  region: string | null;
  district_city: string | null;
  year_established: number | null;
  employees_count: number | null;
  verification_status: string;
  created_at: Date;
  updated_at: Date;
}

const businessSelect = `
  SELECT b.id, u.uid AS owner_uid, u.full_name AS owner_name,
         u.email AS owner_email, b.organisation_name, b.sector,
         b.registration_number, b.tin, b.website, b.description,
         b.logo_path, b.country, b.region, b.district_city,
         b.year_established, b.employees_count, b.verification_status,
         b.created_at, b.updated_at
  FROM business_profiles b
  INNER JOIN users u ON u.id = b.owner_user_id
`;

export const createBusinessProfile = async (
  ownerUid: string,
  input: CreateBusinessInput,
  auditContext: AuditRequestContext,
): Promise<BusinessProfile> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE uid = $1 AND deleted_at IS NULL
       AND status = 'active' AND is_verified = TRUE AND account_type = 'business'
       FOR UPDATE`,
      [ownerUid],
    );
    if (owner.rowCount !== 1) {
      const error = Object.assign(
        new Error("An active verified business account is required"),
        { statusCode: 403 },
      );
      throw error;
    }

    const created = await client.query<BusinessProfile>(
      `INSERT INTO business_profiles (
         owner_user_id, organisation_name, sector, registration_number, tin,
         website, description, country, region, district_city,
         year_established, employees_count, verification_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
       RETURNING id, owner_user_id, organisation_name, sector, registration_number,
                 tin, website, description, logo_path, country, region, district_city,
                 year_established, employees_count, verification_status, created_at, updated_at`,
      [
        owner.rows[0].id,
        input.organisation_name,
        input.sector ?? null,
        input.registration_number?.trim() || null,
        input.tin?.trim() || null,
        input.website ?? null,
        input.description ?? null,
        input.country ?? "Tanzania",
        input.region ?? null,
        input.district_city ?? null,
        input.year_established ?? null,
        input.employees_count ?? null,
      ],
    );
    const businessId = created.rows[0].id;
    await insertAuditLog(client, {
      ...auditContext,
      actorUid: ownerUid,
      action: "businesses.created",
      entityType: "business_profiles",
      entityId: businessId,
      newValues: {
        organisation_name: input.organisation_name,
        verification_status: "pending",
      },
    });
    const result = await client.query<BusinessProfile>(
      `${businessSelect} WHERE b.id = $1`,
      [businessId],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listOwnedBusinesses = async (
  ownerUid: string,
): Promise<BusinessProfile[]> => {
  const result = await pool.query<BusinessProfile>(
    `${businessSelect} WHERE u.uid = $1 AND u.deleted_at IS NULL ORDER BY b.created_at DESC`,
    [ownerUid],
  );
  return result.rows;
};

export const listBusinessProfiles = async (
  filters: BusinessSearchQuery,
  approvedOnly = false,
): Promise<{ data: BusinessProfile[]; total: number }> => {
  const conditions = ["u.deleted_at IS NULL"];
  const values: unknown[] = [];

  if (approvedOnly) {
    conditions.push("b.verification_status = 'approved'");
  } else if (filters.verification_status) {
    values.push(filters.verification_status);
    conditions.push(`b.verification_status = $${values.length}`);
  }
  if (filters.region) {
    values.push(filters.region);
    conditions.push(`b.region = $${values.length}`);
  }
  if (filters.sector) {
    values.push(filters.sector);
    conditions.push(`b.sector = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(
      `(b.organisation_name ILIKE $${values.length} OR b.registration_number ILIKE $${values.length})`,
    );
  }

  const where = conditions.join(" AND ");
  const count = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM business_profiles b
     INNER JOIN users u ON u.id = b.owner_user_id WHERE ${where}`,
    values,
  );
  const pagedValues = [
    ...values,
    filters.limit,
    (filters.page - 1) * filters.limit,
  ];
  const data = await pool.query<BusinessProfile>(
    `${businessSelect} WHERE ${where} ORDER BY b.created_at DESC, b.id DESC
     LIMIT $${pagedValues.length - 1} OFFSET $${pagedValues.length}`,
    pagedValues,
  );
  return { data: data.rows, total: Number(count.rows[0].total) };
};

export const updateOwnedBusiness = async (
  ownerUid: string,
  businessId: string,
  changes: UpdateBusinessInput,
  auditContext: AuditRequestContext,
): Promise<BusinessProfile | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<
      BusinessProfile & { owner_user_id: string }
    >(
      `${businessSelect} WHERE b.id = $1 AND u.uid = $2 AND u.deleted_at IS NULL FOR UPDATE OF b`,
      [businessId, ownerUid],
    );
    if (current.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const allowedFields = [
      "organisation_name",
      "sector",
      "registration_number",
      "tin",
      "website",
      "description",
      "country",
      "region",
      "district_city",
      "year_established",
      "employees_count",
    ] as const;
    const values: unknown[] = [businessId];
    const assignments: string[] = [];
    for (const field of allowedFields) {
      const value = changes[field];
      if (value !== undefined) {
        const normalized =
          typeof value === "string" &&
          (field === "registration_number" || field === "tin")
            ? value.trim() || null
            : value;
        values.push(normalized);
        assignments.push(`${field} = $${values.length}`);
      }
    }
    assignments.push(
      "verification_status = CASE WHEN verification_status = 'approved' THEN 'pending' ELSE verification_status END",
    );
    assignments.push("updated_at = NOW()");
    await client.query(
      `UPDATE business_profiles SET ${assignments.join(", ")} WHERE id = $1`,
      values,
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid: ownerUid,
      action: "businesses.updated",
      entityType: "business_profiles",
      entityId: businessId,
      oldValues: { organisation_name: current.rows[0].organisation_name },
      newValues: changes as Record<string, unknown>,
    });
    const updated = await client.query<BusinessProfile>(
      `${businessSelect} WHERE b.id = $1`,
      [businessId],
    );
    await client.query("COMMIT");
    return updated.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateBusinessForReview = async (
  businessId: string,
  changes: UpdateBusinessInput,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<BusinessProfile | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<BusinessProfile>(
      `${businessSelect} WHERE b.id = $1 FOR UPDATE OF b`,
      [businessId],
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }

    const allowedFields = [
      "organisation_name",
      "sector",
      "registration_number",
      "tin",
      "website",
      "description",
      "country",
      "region",
      "district_city",
      "year_established",
      "employees_count",
    ] as const;
    const values: unknown[] = [businessId];
    const assignments: string[] = [];
    for (const field of allowedFields) {
      const value = changes[field];
      if (value !== undefined) {
        const normalized =
          typeof value === "string" &&
          (field === "registration_number" || field === "tin")
            ? value.trim() || null
            : value;
        values.push(normalized);
        assignments.push(`${field} = $${values.length}`);
      }
    }
    assignments.push(
      "verification_status = CASE WHEN verification_status = 'approved' THEN 'pending' ELSE verification_status END",
    );
    assignments.push("updated_at = NOW()");
    await client.query(
      `UPDATE business_profiles SET ${assignments.join(", ")} WHERE id = $1`,
      values,
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "businesses.review_record_updated",
      entityType: "business_profiles",
      entityId: businessId,
      oldValues: { organisation_name: current.rows[0].organisation_name },
      newValues: changes as Record<string, unknown>,
    });
    const updated = await client.query<BusinessProfile>(
      `${businessSelect} WHERE b.id = $1`,
      [businessId],
    );
    await client.query("COMMIT");
    return updated.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const setBusinessVerification = async (
  businessId: string,
  verificationStatus: string,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{
      id: string;
      verification_status: string;
    }>(
      "SELECT id, verification_status FROM business_profiles WHERE id = $1 FOR UPDATE",
      [businessId],
    );
    if (current.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      "UPDATE business_profiles SET verification_status = $2, updated_at = NOW() WHERE id = $1",
      [businessId, verificationStatus],
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "businesses.verification_changed",
      entityType: "business_profiles",
      entityId: businessId,
      oldValues: { verification_status: current.rows[0].verification_status },
      newValues: { verification_status: verificationStatus },
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

export const getBusinessProfile = async (
  businessId: string,
  ownerUid?: string,
  approvedOnly = false,
): Promise<BusinessProfile | null> => {
  const conditions = ["b.id = $1", "u.deleted_at IS NULL"];
  const values: unknown[] = [businessId];
  if (ownerUid) {
    values.push(ownerUid);
    conditions.push(
      `(u.uid = $${values.length} OR b.verification_status = 'approved')`,
    );
  }
  if (approvedOnly && !ownerUid) {
    conditions.push("b.verification_status = 'approved'");
  }
  const result = await pool.query<BusinessProfile>(
    `${businessSelect} WHERE ${conditions.join(" AND ")} LIMIT 1`,
    values,
  );
  return result.rows[0] ?? null;
};
