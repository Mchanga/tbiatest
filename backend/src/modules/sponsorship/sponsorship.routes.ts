import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog } from "../../services/audit.service.js";

const router = Router();
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const applicationSchema = z
  .object({
    edition_id: z.number().int().positive().optional(),
    package_id: z.number().int().positive().optional(),
    organisation_name: z.string().trim().min(2).max(190),
    contact_person: z.string().trim().min(2).max(150),
    job_title: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(7).max(30),
    website: z.string().url().max(255).optional(),
    proposed_contribution: z.string().trim().max(255).optional(),
    partnership_objectives: z.string().trim().max(10000).optional(),
    comments: z.string().trim().max(10000).optional(),
  })
  .strict();
const applicationStatus = z.enum([
  "new",
  "contacted",
  "negotiating",
  "approved",
  "rejected",
  "converted",
]);
const packageSchema = z
  .object({
    edition_id: z.number().int().positive(),
    level_id: z.number().int().positive(),
    title: z.string().trim().min(2).max(190),
    price: z.number().min(0).max(1_000_000_000),
    currency: z.string().trim().length(3).default("TZS"),
    is_exclusive: z.boolean().default(false),
    slots_available: z.number().int().positive().nullable().optional(),
    benefits: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    is_active: z.boolean().default(true),
  })
  .strict();
const sponsorSchema = z
  .object({
    edition_id: z.number().int().positive(),
    level_id: z.number().int().positive(),
    name: z.string().trim().min(2).max(190),
    logo_path: z.string().trim().max(1000).nullable().optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    website_url: z
      .string()
      .url()
      .max(255)
      .refine(
        (value) => /^https?:\/\//i.test(value),
        "Website must use HTTP or HTTPS",
      )
      .nullable()
      .optional(),
    is_published: z.boolean().default(false),
    sort_order: z.number().int().min(0).max(32767).default(0),
  })
  .strict();
const idSchema = z.coerce.number().int().positive();

router.get(
  "/management/levels",
  authenticate,
  authorize("sponsorships.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      "SELECT id,name,sort_order FROM sponsorship_levels ORDER BY sort_order,name",
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/management/packages",
  authenticate,
  authorize("sponsorships.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT p.id,p.edition_id,e.name AS edition,p.level_id,l.name AS level,p.title,p.price,p.currency,
            p.is_exclusive,p.slots_available,p.benefits,p.is_active
     FROM sponsorship_packages p JOIN award_editions e ON e.id=p.edition_id
     JOIN sponsorship_levels l ON l.id=p.level_id
     ORDER BY e.year DESC,l.sort_order,p.id`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/management/packages",
  authenticate,
  authorize("sponsorships.manage"),
  asyncHandler(async (req, res) => {
    const input = packageSchema.safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid sponsorship package",
        errors: input.error.flatten(),
      });
    const v = input.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query(
        `INSERT INTO sponsorship_packages (edition_id,level_id,title,price,currency,is_exclusive,slots_available,benefits,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING id,edition_id,level_id,title,price,currency,is_exclusive,slots_available,benefits,is_active`,
        [
          v.edition_id,
          v.level_id,
          v.title,
          v.price,
          v.currency,
          v.is_exclusive,
          v.slots_available ?? null,
          JSON.stringify(v.benefits),
          v.is_active,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.package_created",
        entityType: "sponsorship_packages",
        entityId: String(saved.rows[0].id),
        newValues: v,
      });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/management/packages/:id",
  authenticate,
  authorize("sponsorships.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    const input = packageSchema
      .partial()
      .strict()
      .refine((value) => Object.keys(value).length > 0)
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid package update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const fields = [
      "edition_id",
      "level_id",
      "title",
      "price",
      "currency",
      "is_exclusive",
      "slots_available",
      "benefits",
      "is_active",
    ] as const;
    const values: unknown[] = [id.data];
    const sets: string[] = [];
    for (const field of fields)
      if (input.data[field] !== undefined) {
        values.push(
          field === "benefits"
            ? JSON.stringify(input.data[field])
            : input.data[field],
        );
        sets.push(
          `${field}=$${values.length}${field === "benefits" ? "::jsonb" : ""}`,
        );
      }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM sponsorship_packages WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Package not found" });
      }
      const saved = await client.query(
        `UPDATE sponsorship_packages SET ${sets.join(",")} WHERE id=$1 RETURNING *`,
        values,
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.package_updated",
        entityType: "sponsorship_packages",
        entityId: String(id.data),
        oldValues: current.rows[0],
        newValues: input.data as Record<string, unknown>,
      });
      await client.query("COMMIT");
      res.json({ success: true, data: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.delete(
  "/management/packages/:id",
  authenticate,
  authorize("sponsorships.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid package ID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id,is_active FROM sponsorship_packages WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Package not found" });
      }
      const saved = await client.query(
        "UPDATE sponsorship_packages SET is_active=FALSE WHERE id=$1 RETURNING id,is_active",
        [id.data],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.package_deactivated",
        entityType: "sponsorship_packages",
        entityId: String(id.data),
        oldValues: current.rows[0],
        newValues: saved.rows[0],
      });
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

router.get(
  "/management/sponsors",
  authenticate,
  authorize("sponsors.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT s.id,s.edition_id,e.name AS edition,s.level_id,l.name AS level,s.name,s.logo_path,s.description,
            s.website_url,s.is_published,s.sort_order
     FROM sponsors s JOIN award_editions e ON e.id=s.edition_id
     JOIN sponsorship_levels l ON l.id=s.level_id
     ORDER BY e.year DESC,l.sort_order,s.sort_order,s.name`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/management/sponsors",
  authenticate,
  authorize("sponsors.manage"),
  asyncHandler(async (req, res) => {
    const input = sponsorSchema.safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid sponsor",
        errors: input.error.flatten(),
      });
    const v = input.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query(
        `INSERT INTO sponsors (edition_id,level_id,name,logo_path,description,website_url,is_published,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,edition_id,level_id,name,logo_path,description,website_url,is_published,sort_order`,
        [
          v.edition_id,
          v.level_id,
          v.name,
          v.logo_path ?? null,
          v.description ?? null,
          v.website_url ?? null,
          v.is_published,
          v.sort_order,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.sponsor_created",
        entityType: "sponsors",
        entityId: String(saved.rows[0].id),
        newValues: v,
      });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/management/sponsors/:id",
  authenticate,
  authorize("sponsors.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    const input = sponsorSchema
      .partial()
      .strict()
      .refine((value) => Object.keys(value).length > 0)
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid sponsor update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const fields = [
      "edition_id",
      "level_id",
      "name",
      "logo_path",
      "description",
      "website_url",
      "is_published",
      "sort_order",
    ] as const;
    const values: unknown[] = [id.data];
    const sets: string[] = [];
    for (const field of fields)
      if (input.data[field] !== undefined) {
        values.push(input.data[field]);
        sets.push(`${field}=$${values.length}`);
      }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM sponsors WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Sponsor not found" });
      }
      const saved = await client.query(
        `UPDATE sponsors SET ${sets.join(",")} WHERE id=$1 RETURNING *`,
        values,
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.sponsor_updated",
        entityType: "sponsors",
        entityId: String(id.data),
        oldValues: current.rows[0],
        newValues: input.data as Record<string, unknown>,
      });
      await client.query("COMMIT");
      res.json({ success: true, data: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.delete(
  "/management/sponsors/:id",
  authenticate,
  authorize("sponsors.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid sponsor ID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id,is_published FROM sponsors WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Sponsor not found" });
      }
      const saved = await client.query(
        "UPDATE sponsors SET is_published=FALSE WHERE id=$1 RETURNING id,is_published",
        [id.data],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.sponsor_unpublished",
        entityType: "sponsors",
        entityId: String(id.data),
        oldValues: current.rows[0],
        newValues: saved.rows[0],
      });
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

router.get(
  "/packages",
  asyncHandler(async (req, res) => {
    const editionId =
      req.query.edition_id === undefined ? null : Number(req.query.edition_id);
    if (editionId !== null && (!Number.isInteger(editionId) || editionId < 1))
      return void res
        .status(400)
        .json({ success: false, message: "Invalid edition ID" });
    const result = await pool.query(
      `SELECT p.id,p.edition_id,e.name AS edition,p.level_id,l.name AS level,p.title,p.price,p.currency,
            p.is_exclusive,p.slots_available,p.benefits
     FROM sponsorship_packages p JOIN award_editions e ON e.id=p.edition_id
     JOIN sponsorship_levels l ON l.id=p.level_id
     WHERE p.is_active=TRUE AND ($1::int IS NULL OR p.edition_id=$1)
     ORDER BY e.year DESC,l.sort_order,p.id`,
      [editionId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT s.id,s.name,s.logo_path,s.description,s.website_url,l.name AS level,e.name AS edition
     FROM sponsors s JOIN sponsorship_levels l ON l.id=s.level_id JOIN award_editions e ON e.id=s.edition_id
     WHERE s.is_published=TRUE ORDER BY e.year DESC,l.sort_order,s.sort_order,s.name`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/applications",
  applicationLimiter,
  asyncHandler(async (req, res) => {
    const input = applicationSchema.safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid sponsorship application",
        errors: input.error.flatten(),
      });
    const v = input.data;
    if (v.package_id) {
      const packageResult = await pool.query(
        "SELECT id,edition_id,is_active FROM sponsorship_packages WHERE id=$1",
        [v.package_id],
      );
      if (
        !packageResult.rowCount ||
        !packageResult.rows[0].is_active ||
        (v.edition_id && v.edition_id !== packageResult.rows[0].edition_id)
      )
        return void res.status(400).json({
          success: false,
          message: "The selected package is not available for that edition",
        });
    }
    const reference = `SP-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const result = await pool.query(
      `INSERT INTO sponsor_applications (reference_no,edition_id,package_id,organisation_name,contact_person,job_title,email,phone,website,proposed_contribution,partnership_objectives,comments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING reference_no,organisation_name,status,created_at`,
      [
        reference,
        v.edition_id ?? null,
        v.package_id ?? null,
        v.organisation_name,
        v.contact_person,
        v.job_title ?? null,
        v.email.toLowerCase(),
        v.phone,
        v.website ?? null,
        v.proposed_contribution ?? null,
        v.partnership_objectives ?? null,
        v.comments ?? null,
      ],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }),
);

router.get(
  "/applications",
  authenticate,
  authorize("sponsors.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT a.id,a.reference_no,a.edition_id,e.name AS edition,a.package_id,p.title AS package,
            a.organisation_name,a.contact_person,a.job_title,a.email,a.phone,a.website,
            a.proposed_contribution,a.partnership_objectives,a.comments,a.status,a.assigned_to,a.created_at,a.updated_at
     FROM sponsor_applications a LEFT JOIN award_editions e ON e.id=a.edition_id
     LEFT JOIN sponsorship_packages p ON p.id=a.package_id ORDER BY a.created_at DESC LIMIT 500`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.patch(
  "/applications/:id/status",
  authenticate,
  authorize("sponsors.manage"),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const status = z
      .object({ status: applicationStatus })
      .strict()
      .safeParse(req.body);
    if (!id.success || !status.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid application status" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT status FROM sponsor_applications WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Application not found" });
      }
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1",
        [req.user!.uid],
      );
      const updated = await client.query(
        "UPDATE sponsor_applications SET status=$2,assigned_to=$3,updated_at=NOW() WHERE id=$1 RETURNING id,reference_no,status,updated_at",
        [id.data, status.data.status, actor.rows[0].id],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "sponsorship.application_status_changed",
        entityType: "sponsor_applications",
        entityId: String(id.data),
        oldValues: current.rows[0],
        newValues: status.data,
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

export default router;
