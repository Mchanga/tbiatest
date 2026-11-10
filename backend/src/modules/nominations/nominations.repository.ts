import pool from "../../config/database.js";
import {
  insertAuditLog,
  type AuditRequestContext,
} from "../../services/audit.service.js";
import type {
  CreateNominationInput,
  NominationListQuery,
  UpdateNominationContentInput,
  UpdateNominationStatusInput,
} from "./nominations.validation.js";

export interface NominationRecord {
  id: string;
  reference_no: string;
  edition_category_id: number;
  edition_id: number;
  edition_name: string;
  category_name: string;
  category_slug: string;
  nomination_kind: string;
  nominator_user_id: string;
  nominator_name: string;
  nominee_user_id: string | null;
  nominee_business_id: string | null;
  nominee_full_name: string;
  nominee_organisation: string | null;
  nominee_email: string | null;
  nominee_phone: string | null;
  nominee_photo_path: string | null;
  reason_for_nomination: string;
  achievements: string | null;
  business_impact: string | null;
  supporting_links: Record<string, unknown> | null;
  consent_accepted: boolean;
  consent_accepted_at: Date | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const nominationSelect = `
  SELECT n.id, n.reference_no, n.edition_category_id, ec.edition_id,
         ae.name AS edition_name, ac.name AS category_name, ac.slug AS category_slug,
         n.nominator_user_id, nominator.full_name AS nominator_name,
         n.nomination_kind, n.nominee_user_id,
         nominee_user.full_name AS nominee_user_name,
         n.nominee_business_id,
         bp.organisation_name AS nominee_business_name,
         n.nominee_full_name, n.nominee_organisation, n.nominee_email,
         n.nominee_phone, n.nominee_photo_path, n.reason_for_nomination, n.achievements,
         n.business_impact, n.supporting_links, n.consent_accepted,
         n.consent_accepted_at, n.status, n.rejection_reason,
         n.reviewed_by, n.submitted_at, n.created_at, n.updated_at
  FROM nominations n
  INNER JOIN edition_categories ec ON ec.id = n.edition_category_id
  INNER JOIN award_categories ac ON ac.id = ec.category_id
  INNER JOIN award_editions ae ON ae.id = ec.edition_id
  INNER JOIN users nominator ON nominator.id = n.nominator_user_id
  LEFT JOIN users nominee_user ON nominee_user.id = n.nominee_user_id
  LEFT JOIN business_profiles bp ON bp.id = n.nominee_business_id
`;

const getUserIdByUid = async (uid: string): Promise<string | null> => {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE uid = $1 AND deleted_at IS NULL LIMIT 1",
    [uid],
  );
  return result.rows[0]?.id ?? null;
};

const statusTransitionMap: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "rejected"],
  under_review: ["approved", "rejected", "pending_information"],
  pending_information: ["submitted", "under_review", "rejected"],
  approved: ["shortlisted", "finalist", "winner"],
  shortlisted: ["finalist", "winner"],
  finalist: ["winner"],
  rejected: [],
  winner: [],
};

export const listNominationRecords = async (
  actorUid: string,
  filters: NominationListQuery,
  allowAll: boolean,
): Promise<{ data: NominationRecord[]; total: number }> => {
  const actorId = allowAll ? null : await getUserIdByUid(actorUid);
  if (!allowAll && !actorId) {
    return { data: [], total: 0 };
  }

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (!allowAll) {
    values.push(actorId);
    conditions.push(`n.nominator_user_id = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`n.status = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(
      `(n.nominee_full_name ILIKE $${values.length} OR n.nominee_organisation ILIKE $${values.length} OR n.reference_no ILIKE $${values.length})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM nominations n ${where}`,
    values,
  );

  const queryValues = [
    ...values,
    filters.limit,
    (filters.page - 1) * filters.limit,
  ];
  const rows = await pool.query<NominationRecord>(
    `${nominationSelect} ${where}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
    queryValues,
  );

  return { data: rows.rows, total: Number(count.rows[0].total) };
};

export const getNominationById = async (
  nominationId: string,
  actorUid: string,
  allowAll: boolean,
): Promise<NominationRecord | null> => {
  const actorId = await getUserIdByUid(actorUid);
  if (!actorId) {
    return null;
  }

  const conditions = ["n.id = $1"];
  const values: unknown[] = [nominationId];
  if (!allowAll) {
    values.push(actorId);
    conditions.push(`n.nominator_user_id = $${values.length}`);
  }

  const result = await pool.query<NominationRecord>(
    `${nominationSelect} WHERE ${conditions.join(" AND ")} LIMIT 1`,
    values,
  );

  return result.rows[0] ?? null;
};

export const createNomination = async (
  input: CreateNominationInput,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<NominationRecord> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actorId = await getUserIdByUid(actorUid);
    if (!actorId) {
      throw Object.assign(new Error("Authenticated user not found"), {
        statusCode: 404,
      });
    }

    const editionCheck = await client.query<{
      edition_id: number;
      edition_status: string;
    }>(
      `SELECT ec.id, ec.edition_id, ae.status AS edition_status
       FROM edition_categories ec
       INNER JOIN award_editions ae ON ae.id = ec.edition_id
       WHERE ec.id = $1`,
      [input.edition_category_id],
    );

    if (
      editionCheck.rowCount !== 1 ||
      editionCheck.rows[0].edition_status !== "nominations_open"
    ) {
      throw Object.assign(
        new Error("This category is not currently accepting nominations"),
        { statusCode: 409 },
      );
    }

    if (input.nominee_business_id) {
      const business = await client.query<{ id: string }>(
        "SELECT id FROM business_profiles WHERE id = $1 LIMIT 1",
        [input.nominee_business_id],
      );
      if (business.rowCount !== 1) {
        throw Object.assign(new Error("Nominee business not found"), {
          statusCode: 404,
        });
      }
    }

    if (input.nominee_user_id) {
      const nominee = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
        [input.nominee_user_id],
      );
      if (nominee.rowCount !== 1) {
        throw Object.assign(new Error("Nominee user not found"), {
          statusCode: 404,
        });
      }
    }

    const status = input.status ?? "draft";
    const submittedAt = status === "submitted" ? "NOW()" : "NULL";
    const referenceNo = `NOM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const created = await client.query<NominationRecord>(
      `INSERT INTO nominations (
         reference_no, edition_category_id, nominator_user_id, nomination_kind,
         nominee_user_id, nominee_business_id, nominee_full_name,
         nominee_organisation, nominee_email, nominee_phone,
         nominee_photo_path, business_profile, reason_for_nomination,
         achievements, business_impact, supporting_links, consent_accepted,
         consent_accepted_at, status, submitted_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, NOW(), $18, ${submittedAt}
       )
       RETURNING *`,
      [
        referenceNo,
        input.edition_category_id,
        actorId,
        input.nomination_kind,
        input.nominee_user_id ?? null,
        input.nominee_business_id ?? null,
        input.nominee_full_name,
        input.nominee_organisation ?? null,
        input.nominee_email ?? null,
        input.nominee_phone ?? null,
        input.nominee_photo_path ?? null,
        input.business_profile ?? null,
        input.reason_for_nomination,
        input.achievements ?? null,
        input.business_impact ?? null,
        input.supporting_links ?? null,
        input.consent_accepted,
        status,
      ],
    );

    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "nominations.created",
      entityType: "nominations",
      entityId: created.rows[0].id,
      newValues: {
        reference_no: referenceNo,
        edition_category_id: input.edition_category_id,
        status,
      },
    });

    await client.query("COMMIT");
    return (await getNominationById(
      created.rows[0].id,
      actorUid,
      true,
    )) as NominationRecord;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateNominationStatus = async (
  nominationId: string,
  input: UpdateNominationStatusInput,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<NominationRecord> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actorId = await getUserIdByUid(actorUid);
    if (!actorId) {
      throw Object.assign(new Error("Authenticated user not found"), {
        statusCode: 404,
      });
    }

    const current = await client.query<{
      id: string;
      status: string;
      nominator_user_id: string;
    }>(
      "SELECT id, status, nominator_user_id FROM nominations WHERE id = $1 FOR UPDATE",
      [nominationId],
    );

    if (current.rowCount !== 1) {
      throw Object.assign(new Error("Nomination not found"), {
        statusCode: 404,
      });
    }

    const previousStatus = current.rows[0].status;
    const allowed = statusTransitionMap[previousStatus] ?? [];
    if (!allowed.includes(input.status)) {
      throw Object.assign(
        new Error(
          `Nomination cannot move from ${previousStatus} to ${input.status}`,
        ),
        { statusCode: 409 },
      );
    }

    if (input.status === "rejected" && !input.rejection_reason) {
      throw Object.assign(
        new Error("A rejection reason is required when rejecting a nomination"),
        { statusCode: 400 },
      );
    }

    const updated = await client.query<NominationRecord>(
      `UPDATE nominations
       SET status = $2,
           rejection_reason = CASE WHEN $2 = 'rejected' THEN COALESCE($3, rejection_reason) ELSE NULL END,
           reviewed_by = $4,
           submitted_at = CASE WHEN $2 = 'submitted' AND submitted_at IS NULL THEN NOW() ELSE submitted_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [nominationId, input.status, input.rejection_reason ?? null, actorId],
    );

    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "nominations.status_changed",
      entityType: "nominations",
      entityId: nominationId,
      oldValues: { status: previousStatus },
      newValues: {
        status: input.status,
        rejection_reason: input.rejection_reason ?? null,
      },
    });

    await client.query("COMMIT");
    return (await getNominationById(
      updated.rows[0].id,
      actorUid,
      true,
    )) as NominationRecord;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateNominationContent = async (
  nominationId: string,
  input: UpdateNominationContentInput,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<NominationRecord> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ status: string }>(
      "SELECT status FROM nominations WHERE id = $1 FOR UPDATE",
      [nominationId],
    );
    if (!current.rowCount) {
      throw Object.assign(new Error("Nomination not found"), {
        statusCode: 404,
      });
    }
    if (
      !["submitted", "under_review", "pending_information"].includes(
        current.rows[0].status,
      )
    ) {
      throw Object.assign(
        new Error("Only nominations in active review can be edited"),
        { statusCode: 409 },
      );
    }

    const fields = [
      "nominee_full_name",
      "nominee_organisation",
      "nominee_email",
      "nominee_phone",
      "nominee_photo_path",
      "reason_for_nomination",
      "achievements",
      "business_impact",
    ] as const;
    const values: unknown[] = [nominationId];
    const assignments: string[] = [];
    for (const field of fields) {
      if (input[field] !== undefined) {
        values.push(input[field]);
        assignments.push(`${field} = $${values.length}`);
      }
    }
    assignments.push("updated_at = NOW()");
    const updated = await client.query<{ id: string }>(
      `UPDATE nominations SET ${assignments.join(", ")} WHERE id = $1 RETURNING id`,
      values,
    );
    await insertAuditLog(client, {
      ...auditContext,
      actorUid,
      action: "nominations.content_updated",
      entityType: "nominations",
      entityId: nominationId,
      newValues: input as Record<string, unknown>,
    });
    await client.query("COMMIT");
    const record = await getNominationById(updated.rows[0].id, actorUid, true);
    if (!record)
      throw Object.assign(new Error("Updated nomination could not be loaded"), {
        statusCode: 500,
      });
    return record;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
