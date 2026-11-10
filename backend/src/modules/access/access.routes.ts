import { Router } from "express";
import { z } from "zod";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import { insertAuditLog } from "../../services/audit.service.js";
import asyncHandler from "../../utils/asyncHandler.js";

const router = Router();
const roleIdSchema = z.coerce.number().int().positive();
const roleSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
  })
  .strict();
const roleUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field must be provided",
  });
const rolePermissionsSchema = z
  .object({
    permissionSlugs: z
      .array(z.string().trim().min(1).max(100))
      .max(200)
      .refine((slugs) => new Set(slugs).size === slugs.length, {
        message: "Permission slugs must be unique",
      }),
  })
  .strict();
const auditQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().trim().max(100).optional(),
    entity_type: z.string().trim().max(100).optional(),
    search: z.string().trim().max(150).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .strict();

const auditContext = (
  req: Parameters<import("express").RequestHandler>[0],
) => ({
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

router.use(authenticate);

router.get(
  "/roles",
  authorize("roles.view"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT r.id, r.slug, r.name, r.description, r.is_staff, r.created_at,
         COUNT(DISTINCT ur.user_id)::int AS assigned_users,
         COALESCE(
           ARRAY_AGG(DISTINCT p.slug) FILTER (WHERE p.slug IS NOT NULL),
           ARRAY[]::varchar[]
         ) AS permission_slugs
       FROM roles r
       LEFT JOIN user_roles ur ON ur.role_id = r.id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id
       ORDER BY r.is_staff DESC, r.name`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/permissions",
  authorize("permissions.view"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, slug, module, description
       FROM permissions
       ORDER BY module, slug`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/roles",
  authorize("roles.manage"),
  asyncHandler(async (req, res) => {
    const input = roleSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        success: false,
        message: "Invalid role",
        errors: input.error.flatten(),
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query(
        `INSERT INTO roles (slug, name, description, is_staff)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id, slug, name, description, is_staff, created_at`,
        [input.data.slug, input.data.name, input.data.description ?? null],
      );
      await insertAuditLog(client, {
        ...auditContext(req),
        actorUid: req.user!.uid,
        action: "roles.created",
        entityType: "roles",
        entityId: String(created.rows[0].id),
        newValues: input.data,
      });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: created.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res
          .status(409)
          .json({ success: false, message: "Role slug already exists" });
        return;
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/roles/:id",
  authorize("roles.manage"),
  asyncHandler(async (req, res) => {
    const id = roleIdSchema.safeParse(req.params.id);
    const input = roleUpdateSchema.safeParse(req.body);
    if (!id.success || !input.success) {
      res.status(400).json({
        success: false,
        message: "Invalid role update",
        errors: input.success ? undefined : input.error.flatten(),
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id, slug, name, description FROM roles WHERE id = $1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ success: false, message: "Role not found" });
        return;
      }
      const updated = await client.query(
        `UPDATE roles SET
           name = CASE WHEN $2::boolean THEN $3 ELSE name END,
           description = CASE WHEN $4::boolean THEN $5 ELSE description END
         WHERE id = $1
         RETURNING id, slug, name, description, is_staff, created_at`,
        [
          id.data,
          input.data.name !== undefined,
          input.data.name ?? null,
          input.data.description !== undefined,
          input.data.description ?? null,
        ],
      );
      await insertAuditLog(client, {
        ...auditContext(req),
        actorUid: req.user!.uid,
        action: "roles.updated",
        entityType: "roles",
        entityId: String(id.data),
        oldValues: current.rows[0],
        newValues: input.data,
      });
      await client.query("COMMIT");
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.delete(
  "/roles/:id",
  authorize("roles.manage"),
  asyncHandler(async (req, res) => {
    const id = roleIdSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ success: false, message: "Invalid role ID" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ slug: string; name: string }>(
        "SELECT slug, name FROM roles WHERE id = $1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ success: false, message: "Role not found" });
        return;
      }
      if (current.rows[0].slug === "super_admin") {
        await client.query("ROLLBACK");
        res.status(409).json({
          success: false,
          message: "The super_admin role cannot be deleted",
        });
        return;
      }
      const assigned = await client.query<{ assigned: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM user_roles WHERE role_id = $1
           UNION ALL
           SELECT 1 FROM users WHERE role_id = $1
         ) AS assigned`,
        [id.data],
      );
      if (assigned.rows[0].assigned) {
        await client.query("ROLLBACK");
        res.status(409).json({
          success: false,
          message: "Reassign users before deleting this role",
        });
        return;
      }
      await insertAuditLog(client, {
        ...auditContext(req),
        actorUid: req.user!.uid,
        action: "roles.deleted",
        entityType: "roles",
        entityId: String(id.data),
        oldValues: current.rows[0],
      });
      await client.query("DELETE FROM role_permissions WHERE role_id = $1", [
        id.data,
      ]);
      await client.query("DELETE FROM roles WHERE id = $1", [id.data]);
      await client.query("COMMIT");
      res.status(204).end();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.put(
  "/roles/:id/permissions",
  authorize("permissions.manage"),
  asyncHandler(async (req, res) => {
    const id = roleIdSchema.safeParse(req.params.id);
    const input = rolePermissionsSchema.safeParse(req.body);
    if (!id.success || !input.success) {
      res.status(400).json({
        success: false,
        message: "Invalid role permissions",
        errors: input.success ? undefined : input.error.flatten(),
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const role = await client.query<{ slug: string }>(
        "SELECT slug FROM roles WHERE id = $1 FOR UPDATE",
        [id.data],
      );
      if (!role.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ success: false, message: "Role not found" });
        return;
      }
      if (role.rows[0].slug === "super_admin") {
        await client.query("ROLLBACK");
        res.status(409).json({
          success: false,
          message: "Super Admin permissions are fixed to protect system access",
        });
        return;
      }
      const permissions = await client.query<{ id: number; slug: string }>(
        "SELECT id, slug FROM permissions WHERE slug = ANY($1::varchar[])",
        [input.data.permissionSlugs],
      );
      if (permissions.rowCount !== input.data.permissionSlugs.length) {
        await client.query("ROLLBACK");
        res.status(400).json({
          success: false,
          message: "One or more permission slugs are invalid",
        });
        return;
      }
      const oldPermissions = await client.query<{ slug: string }>(
        `SELECT p.slug FROM role_permissions rp
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1 ORDER BY p.slug`,
        [id.data],
      );
      await client.query("DELETE FROM role_permissions WHERE role_id = $1", [
        id.data,
      ]);
      if (permissions.rows.length) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, p.id FROM permissions p WHERE p.slug = ANY($2::varchar[])`,
          [id.data, input.data.permissionSlugs],
        );
      }
      await insertAuditLog(client, {
        ...auditContext(req),
        actorUid: req.user!.uid,
        action: "roles.permissions_updated",
        entityType: "roles",
        entityId: String(id.data),
        oldValues: {
          permissionSlugs: oldPermissions.rows.map((row) => row.slug),
        },
        newValues: { permissionSlugs: input.data.permissionSlugs },
      });
      await client.query("COMMIT");
      res.json({
        success: true,
        data: {
          role_id: id.data,
          permission_slugs: input.data.permissionSlugs,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/audit-logs",
  authorize("audit_logs.view"),
  asyncHandler(async (req, res) => {
    const query = auditQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        success: false,
        message: "Invalid audit-log filters",
        errors: query.error.flatten(),
      });
      return;
    }

    const conditions: string[] = [];
    const values: unknown[] = [];
    for (const [field, column] of [
      ["action", "a.action"],
      ["entity_type", "a.entity_type"],
    ] as const) {
      const value = query.data[field];
      if (value) {
        values.push(value);
        conditions.push(`${column} = $${values.length}`);
      }
    }
    if (query.data.search) {
      values.push(`%${query.data.search}%`);
      conditions.push(
        `(u.full_name ILIKE $${values.length} OR u.email::text ILIKE $${values.length} OR a.entity_id::text ILIKE $${values.length})`,
      );
    }
    if (query.data.from) {
      values.push(query.data.from);
      conditions.push(`a.created_at >= $${values.length}::date`);
    }
    if (query.data.to) {
      values.push(query.data.to);
      conditions.push(
        `a.created_at < ($${values.length}::date + INTERVAL '1 day')`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where}`,
      values,
    );
    const pageValues = [
      ...values,
      query.data.limit,
      (query.data.page - 1) * query.data.limit,
    ];
    const logs = await pool.query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.old_values,
         a.new_values, a.ip_address, a.user_agent, a.request_id, a.created_at,
         u.uid AS actor_uid, u.full_name AS actor_name, u.email AS actor_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    const total = Number(count.rows[0].total);
    res.json({
      success: true,
      data: logs.rows,
      pagination: {
        page: query.data.page,
        limit: query.data.limit,
        total,
        pages: Math.ceil(total / query.data.limit),
      },
    });
  }),
);

export default router;
