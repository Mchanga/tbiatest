import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog } from "../../services/audit.service.js";

const router = Router();
const idSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await pool.query(
      `SELECT w.id,w.edition_id,ae.name AS edition,w.edition_category_id,ac.name AS category,
            w.winner_name,w.company_name,w.photo_path,w.award_description,w.achievement_summary,w.award_reference,w.announced_at
     FROM winners w JOIN award_editions ae ON ae.id=w.edition_id
     JOIN edition_categories ec ON ec.id=w.edition_category_id JOIN award_categories ac ON ac.id=ec.category_id
     WHERE w.is_published=TRUE ORDER BY ae.year DESC,ac.name`,
    );
    res.json({ success: true, data: rows.rows });
  }),
);

router.get(
  "/manage",
  authenticate,
  authorize("winners.manage"),
  asyncHandler(async (_req, res) => {
    const rows = await pool.query(
      "SELECT * FROM winners ORDER BY created_at DESC,id DESC LIMIT 500",
    );
    res.json({ success: true, data: rows.rows });
  }),
);

router.get(
  "/eligible-nominations",
  authenticate,
  authorize("winners.manage"),
  asyncHandler(async (req, res) => {
    const search = z
      .string()
      .trim()
      .min(2)
      .max(150)
      .safeParse(req.query.search);
    if (!search.success) {
      res.status(400).json({
        success: false,
        message: "Enter at least two characters to search",
      });
      return;
    }
    const nominations = await pool.query(
      `SELECT n.id,n.reference_no,n.nominee_full_name,n.nominee_organisation,
              ae.name AS edition,ac.name AS category
       FROM nominations n
       JOIN edition_categories ec ON ec.id=n.edition_category_id
       JOIN award_editions ae ON ae.id=ec.edition_id
       JOIN award_categories ac ON ac.id=ec.category_id
       WHERE n.status IN ('finalist','winner')
         AND (n.reference_no ILIKE $1 OR n.nominee_full_name ILIKE $1
              OR n.nominee_organisation ILIKE $1)
       ORDER BY ae.year DESC,n.nominee_full_name LIMIT 20`,
      [`%${search.data}%`],
    );
    res.json({ success: true, data: nominations.rows });
  }),
);

router.post(
  "/",
  authenticate,
  authorize("winners.manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        nomination_id: idSchema,
        award_description: z.string().max(10000).optional(),
        achievement_summary: z.string().max(10000).optional(),
        award_reference: z.string().trim().max(60).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid winner record",
        errors: input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nomination = await client.query<{
        id: string;
        edition_id: number;
        edition_category_id: number;
        nominee_full_name: string;
        nominee_organisation: string | null;
        nominee_photo_path: string | null;
        nominee_user_id: string | null;
        status: string;
      }>(
        `SELECT n.id,ec.edition_id,n.edition_category_id,n.nominee_full_name,n.nominee_organisation,n.nominee_photo_path,n.nominee_user_id,n.status
       FROM nominations n JOIN edition_categories ec ON ec.id=n.edition_category_id WHERE n.id=$1 FOR UPDATE OF n`,
        [input.data.nomination_id],
      );
      if (!nomination.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Nomination not found" });
      }
      if (!["finalist", "winner"].includes(nomination.rows[0].status)) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "Only finalist nominations can become winners",
        });
      }
      await client.query(
        "SELECT id FROM edition_categories WHERE id=$1 FOR UPDATE",
        [nomination.rows[0].edition_category_id],
      );
      const existing = await client.query(
        "SELECT id FROM winners WHERE edition_category_id=$1",
        [nomination.rows[0].edition_category_id],
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "A winner is already recorded for this category",
        });
      }
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1",
        [req.user!.uid],
      );
      const created = await client.query(
        `INSERT INTO winners (edition_id,edition_category_id,nomination_id,winner_name,company_name,photo_path,award_description,achievement_summary,award_reference,approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          nomination.rows[0].edition_id,
          nomination.rows[0].edition_category_id,
          nomination.rows[0].id,
          nomination.rows[0].nominee_full_name,
          nomination.rows[0].nominee_organisation,
          nomination.rows[0].nominee_photo_path,
          input.data.award_description ?? null,
          input.data.achievement_summary ?? null,
          input.data.award_reference ?? null,
          actor.rows[0].id,
        ],
      );
      await client.query(
        "UPDATE nominations SET status='winner',updated_at=NOW() WHERE id=$1",
        [nomination.rows[0].id],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "winners.recorded",
        entityType: "winners",
        entityId: String(created.rows[0].id),
        newValues: {
          nomination_id: nomination.rows[0].id,
          edition_category_id: nomination.rows[0].edition_category_id,
        },
      });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: created.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/:id",
  authenticate,
  authorize("winners.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    const input = z
      .object({
        award_description: z.string().max(10000).nullable().optional(),
        achievement_summary: z.string().max(10000).nullable().optional(),
        award_reference: z.string().trim().max(60).nullable().optional(),
      })
      .strict()
      .refine((value) =>
        Object.values(value).some((item) => item !== undefined),
      )
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid winner update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT award_description,achievement_summary,award_reference FROM winners WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Winner not found" });
      }
      const fields = [
        "award_description",
        "achievement_summary",
        "award_reference",
      ] as const;
      const values: unknown[] = [id.data];
      const sets: string[] = [];
      for (const field of fields)
        if (input.data[field] !== undefined) {
          values.push(input.data[field]);
          sets.push(`${field}=$${values.length}`);
        }
      const updated = await client.query(
        `UPDATE winners SET ${sets.join(",")} WHERE id=$1 RETURNING *`,
        values,
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "winners.updated",
        entityType: "winners",
        entityId: id.data,
        oldValues: current.rows[0],
        newValues: input.data as Record<string, unknown>,
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

router.patch(
  "/:id/publish",
  authenticate,
  authorize("winners.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    const input = z
      .object({ is_published: z.boolean() })
      .strict()
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid winner publication request",
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT is_published FROM winners WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Winner not found" });
      }
      const updated = await client.query(
        "UPDATE winners SET is_published=$2,announced_at=CASE WHEN $2 THEN COALESCE(announced_at,NOW()) ELSE NULL END WHERE id=$1 RETURNING id,is_published,announced_at",
        [id.data, input.data.is_published],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "winners.publication_changed",
        entityType: "winners",
        entityId: id.data,
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

router.get(
  "/certificates/mine",
  authenticate,
  authorize("certificates.view_own"),
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      `SELECT c.certificate_no,c.type,c.verification_code,c.issued_at,n.nominee_full_name,w.winner_name
     FROM certificates c JOIN users u ON u.id=c.user_id
     LEFT JOIN nominations n ON n.id=c.nomination_id LEFT JOIN winners w ON w.id=c.winner_id
     WHERE u.uid=$1 ORDER BY c.issued_at DESC`,
      [req.user!.uid],
    );
    res.json({ success: true, data: rows.rows });
  }),
);

router.post(
  "/certificates",
  authenticate,
  authorize("certificates.manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        winner_id: idSchema,
        type: z.enum(["shortlisted", "finalist", "winner"]),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid certificate request",
        errors: input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const winner = await client.query<{
        id: string;
        nomination_id: string | null;
        user_id: string | null;
        winner_name: string;
        is_published: boolean;
      }>(
        `SELECT w.id,w.nomination_id,n.nominee_user_id AS user_id,w.winner_name,w.is_published
       FROM winners w LEFT JOIN nominations n ON n.id=w.nomination_id WHERE w.id=$1 FOR UPDATE OF w`,
        [input.data.winner_id],
      );
      if (!winner.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Winner not found" });
      }
      if (input.data.type === "winner" && !winner.rows[0].is_published) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "Publish the winner before issuing a winner certificate",
        });
      }
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1",
        [req.user!.uid],
      );
      const verificationCode = crypto
        .randomBytes(8)
        .toString("hex")
        .toUpperCase();
      const certificateNo = `TBIA-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      const saved = await client.query(
        `INSERT INTO certificates (certificate_no,user_id,nomination_id,winner_id,type,verification_code,issued_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,certificate_no,type,verification_code,issued_at`,
        [
          certificateNo,
          winner.rows[0].user_id,
          winner.rows[0].nomination_id,
          winner.rows[0].id,
          input.data.type,
          verificationCode,
          actor.rows[0].id,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "certificates.issued",
        entityType: "certificates",
        entityId: String(saved.rows[0].id),
        newValues: {
          certificate_no: certificateNo,
          type: input.data.type,
          winner_id: winner.rows[0].id,
        },
      });
      await client.query("COMMIT");
      res.status(201).json({
        success: true,
        data: { ...saved.rows[0], pdf_available: false },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        return void res
          .status(409)
          .json({ success: false, message: "Certificate already issued" });
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/certificates/verify/:code",
  asyncHandler(async (req, res) => {
    const rawCode = req.params.code;
    const code = z
      .string()
      .regex(/^[A-F0-9]{16}$/)
      .safeParse(typeof rawCode === "string" ? rawCode.toUpperCase() : "");
    if (!code.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid verification code" });
    const result = await pool.query(
      `SELECT c.certificate_no,c.type,c.issued_at,COALESCE(w.winner_name,n.nominee_full_name) AS recipient,
            ae.name AS edition,ac.name AS category
     FROM certificates c LEFT JOIN winners w ON w.id=c.winner_id LEFT JOIN nominations n ON n.id=c.nomination_id
     LEFT JOIN edition_categories ec ON ec.id=n.edition_category_id OR ec.id=w.edition_category_id
     LEFT JOIN award_editions ae ON ae.id=ec.edition_id LEFT JOIN award_categories ac ON ac.id=ec.category_id
     WHERE c.verification_code=$1 LIMIT 1`,
      [code.data],
    );
    if (!result.rowCount)
      return void res
        .status(404)
        .json({ success: false, message: "Certificate not found" });
    res.json({ success: true, valid: true, data: result.rows[0] });
  }),
);

export default router;
