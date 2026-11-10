import pool from "../../config/database.js";
import {
  insertAuditLog,
  type AuditRequestContext,
} from "../../services/audit.service.js";
import type {
  CreateCategoryInput,
  CreateEditionInput,
  EditionCategoryInput,
  UpdateCategoryInput,
  UpdateEditionInput,
} from "./awards.validation.js";

export const listEditions = async (includeArchived = false) => {
  const result = await pool.query(
    `SELECT id, year, name, theme, description, nominations_open_at,
            nominations_close_at, finale_date, finale_venue, status,
            is_current, created_at, updated_at
     FROM award_editions
     WHERE ($1::boolean OR status <> 'archived')
     ORDER BY year DESC, id DESC`,
    [includeArchived],
  );
  return result.rows;
};

export const getEditionById = async (id: string) => {
  const result = await pool.query(
    `SELECT id, year, name, theme, description, nominations_open_at,
            nominations_close_at, finale_date, finale_venue, status,
            is_current, created_at, updated_at
     FROM award_editions WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
};

export const createEdition = async (
  input: CreateEditionInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO award_editions (
         year, name, theme, description, nominations_open_at,
         nominations_close_at, finale_date, finale_venue, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING id, year, name, theme, description, nominations_open_at,
                 nominations_close_at, finale_date, finale_venue, status,
                 is_current, created_at, updated_at`,
      [
        input.year,
        input.name,
        input.theme ?? null,
        input.description ?? null,
        input.nominations_open_at ?? null,
        input.nominations_close_at ?? null,
        input.finale_date ?? null,
        input.finale_venue ?? null,
      ],
    );
    await insertAuditLog(client, {
      ...context,
      actorUid,
      action: "awards.edition_created",
      entityType: "award_editions",
      entityId: String(result.rows[0].id),
      newValues: { year: input.year, name: input.name },
    });
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateEdition = async (
  id: string,
  changes: UpdateEditionInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT * FROM award_editions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (current.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    if (changes.is_current) {
      await client.query(
        "UPDATE award_editions SET is_current = FALSE WHERE is_current = TRUE AND id <> $1",
        [id],
      );
    }

    const fields = [
      "year",
      "name",
      "theme",
      "description",
      "nominations_open_at",
      "nominations_close_at",
      "finale_date",
      "finale_venue",
      "is_current",
    ] as const;
    const values: unknown[] = [id];
    const assignments: string[] = [];
    for (const field of fields) {
      const value = changes[field];
      if (value !== undefined) {
        values.push(value);
        assignments.push(`${field} = $${values.length}`);
      }
    }
    assignments.push("updated_at = NOW()");
    const updated = await client.query(
      `UPDATE award_editions SET ${assignments.join(", ")} WHERE id = $1
       RETURNING id, year, name, theme, description, nominations_open_at,
                 nominations_close_at, finale_date, finale_venue, status,
                 is_current, created_at, updated_at`,
      values,
    );
    await insertAuditLog(client, {
      ...context,
      actorUid,
      action: "awards.edition_updated",
      entityType: "award_editions",
      entityId: id,
      oldValues: { year: current.rows[0].year, status: current.rows[0].status },
      newValues: changes as Record<string, unknown>,
    });
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const transitionEditionStatus = async (
  id: string,
  status: string,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ status: string }>(
      "SELECT status FROM award_editions WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (current.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }

    const currentStatus = current.rows[0].status;
    const allowedTransitions: Record<string, string[]> = {
      draft: ["nominations_open", "archived"],
      nominations_open: ["judging", "archived"],
      judging: ["voting", "finalised", "archived"],
      voting: ["finalised", "archived"],
      finalised: ["completed", "archived"],
      completed: ["archived"],
      archived: [],
    };
    if (!allowedTransitions[currentStatus]?.includes(status)) {
      const error = Object.assign(
        new Error(
          `Edition cannot transition from ${currentStatus} to ${status}`,
        ),
        { statusCode: 409 },
      );
      throw error;
    }

    await client.query(
      "UPDATE award_editions SET status = $2, updated_at = NOW() WHERE id = $1",
      [id, status],
    );
    await insertAuditLog(client, {
      ...context,
      actorUid,
      action: "awards.edition_status_changed",
      entityType: "award_editions",
      entityId: id,
      oldValues: { status: currentStatus },
      newValues: { status },
    });
    await client.query("COMMIT");
    return { previousStatus: currentStatus, status };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listCategories = async (editionId?: string) => {
  const result = await pool.query(
    `SELECT c.id, ec.id AS edition_category_id, c.group_id, g.name AS group_name,
            c.name, c.slug, ae.name AS edition_name,
            c.description, c.icon, c.nominee_type, c.sort_order,
            ec.edition_id, ec.is_active, ec.selection_method,
            ec.jury_weight_percent, ec.vote_weight_percent,
            ec.eligibility_criteria, ec.nomination_guidelines, ec.max_finalists
     FROM award_categories c
     INNER JOIN category_groups g ON g.id = c.group_id
     LEFT JOIN edition_categories ec ON ec.category_id = c.id AND ($1::integer IS NULL OR ec.edition_id = $1)
     LEFT JOIN award_editions ae ON ae.id = ec.edition_id
     ORDER BY c.sort_order, c.name`,
    [editionId ?? null],
  );
  return result.rows;
};

export const createCategory = async (
  input: CreateCategoryInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO award_categories (group_id, name, slug, description, icon, nominee_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, group_id, name, slug, description, icon, nominee_type, sort_order, created_at`,
      [
        input.group_id,
        input.name,
        input.slug,
        input.description ?? null,
        input.icon ?? null,
        input.nominee_type,
        input.sort_order,
      ],
    );
    await insertAuditLog(client, {
      ...context,
      actorUid,
      action: "awards.category_created",
      entityType: "award_categories",
      entityId: String(created.rows[0].id),
      newValues: { name: input.name, slug: input.slug },
    });
    await client.query("COMMIT");
    return created.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateCategory = async (
  id: string,
  changes: UpdateCategoryInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const fields = [
    "group_id",
    "name",
    "slug",
    "description",
    "icon",
    "nominee_type",
    "sort_order",
  ] as const;
  const values: unknown[] = [id];
  const assignments: string[] = [];
  for (const field of fields) {
    const value = changes[field];
    if (value !== undefined) {
      values.push(value);
      assignments.push(`${field} = $${values.length}`);
    }
  }
  if (assignments.length === 0) return null;
  assignments.push("created_at = created_at");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT name, slug FROM award_categories WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (current.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }
    const updated = await client.query(
      `UPDATE award_categories SET ${assignments.join(", ")} WHERE id = $1
       RETURNING id, group_id, name, slug, description, icon, nominee_type, sort_order, created_at`,
      values,
    );
    await insertAuditLog(client, {
      ...context,
      actorUid,
      action: "awards.category_updated",
      entityType: "award_categories",
      entityId: id,
      oldValues: current.rows[0],
      newValues: changes as Record<string, unknown>,
    });
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const configureEditionCategory = async (
  editionId: number,
  categoryId: number,
  input: EditionCategoryInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, is_active, selection_method, jury_weight_percent,
              vote_weight_percent, eligibility_criteria, nomination_guidelines, max_finalists
       FROM edition_categories WHERE edition_id = $1 AND category_id = $2 FOR UPDATE`,
      [editionId, categoryId],
    );
    const saved = await client.query(
      `INSERT INTO edition_categories (
         edition_id, category_id, is_active, selection_method,
         jury_weight_percent, vote_weight_percent, eligibility_criteria,
         nomination_guidelines, max_finalists
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (edition_id, category_id) DO UPDATE SET
         is_active = EXCLUDED.is_active,
         selection_method = EXCLUDED.selection_method,
         jury_weight_percent = EXCLUDED.jury_weight_percent,
         vote_weight_percent = EXCLUDED.vote_weight_percent,
         eligibility_criteria = EXCLUDED.eligibility_criteria,
         nomination_guidelines = EXCLUDED.nomination_guidelines,
         max_finalists = EXCLUDED.max_finalists
       RETURNING id, edition_id, category_id, is_active, selection_method,
                 jury_weight_percent, vote_weight_percent, eligibility_criteria,
                 nomination_guidelines, max_finalists`,
      [
        editionId,
        categoryId,
        input.is_active,
        input.selection_method,
        input.jury_weight_percent,
        input.vote_weight_percent,
        input.eligibility_criteria ?? null,
        input.nomination_guidelines ?? null,
        input.max_finalists,
      ],
    );
    await insertAuditLog(client, {
      ...context,
      actorUid,
      action: current.rowCount
        ? "awards.edition_category_updated"
        : "awards.edition_category_created",
      entityType: "edition_categories",
      entityId: String(saved.rows[0].id),
      oldValues: current.rows[0] ?? null,
      newValues: input as Record<string, unknown>,
    });
    await client.query("COMMIT");
    return saved.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
