import { Router } from "express";
import { z } from "zod";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog } from "../../services/audit.service.js";

const router = Router();
router.use(authenticate);
const judgeIdSchema = z.coerce.number().int().positive();
const assignmentIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const nominationIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const scoreSubmission = z
  .object({
    scores: z
      .array(
        z
          .object({
            criteria_id: z.number().int().positive(),
            score: z.number().min(0).max(100_000),
            comment: z.string().trim().max(1000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    overall_comment: z.string().trim().max(10000).optional(),
  })
  .strict()
  .refine(
    (v) => new Set(v.scores.map((s) => s.criteria_id)).size === v.scores.length,
    { message: "Each criterion may be scored once" },
  );

router.get(
  "/judges",
  authorize("judges.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT j.id,j.user_id,u.uid,u.full_name,u.email,j.edition_id,e.name AS edition,j.title,j.organisation,j.is_active
       FROM judges j JOIN users u ON u.id=j.user_id JOIN award_editions e ON e.id=j.edition_id
       ORDER BY e.year DESC,u.full_name`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/judges/search",
  authorize("nominations.assign_judges"),
  asyncHandler(async (_req, res) => {
    const search = z
      .string()
      .trim()
      .min(2)
      .max(150)
      .safeParse(_req.query.search);
    if (!search.success) {
      res.status(400).json({
        success: false,
        message: "Enter at least two characters to search",
      });
      return;
    }
    const result = await pool.query(
      `SELECT j.id,j.user_id,u.uid,u.full_name,u.email,j.edition_id,e.name AS edition,j.title,j.organisation,j.is_active
       FROM judges j JOIN users u ON u.id=j.user_id JOIN award_editions e ON e.id=j.edition_id
       WHERE u.full_name ILIKE $1 OR u.email::text ILIKE $1 OR e.name ILIKE $1
       ORDER BY e.year DESC,u.full_name LIMIT 20`,
      [`%${search.data}%`],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/user-search",
  authorize("judges.manage"),
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
    const users = await pool.query(
      `SELECT uid,full_name,email
       FROM users
       WHERE status='active' AND is_verified=TRUE AND deleted_at IS NULL
         AND (full_name ILIKE $1 OR email::text ILIKE $1)
       ORDER BY full_name LIMIT 20`,
      [`%${search.data}%`],
    );
    res.json({ success: true, data: users.rows });
  }),
);

router.get(
  "/eligible-nominations",
  authorize("nominations.assign_judges"),
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
       WHERE n.status IN ('submitted','under_review','approved','shortlisted','finalist')
         AND (n.reference_no ILIKE $1 OR n.nominee_full_name ILIKE $1
              OR n.nominee_organisation ILIKE $1)
       ORDER BY ae.year DESC,n.nominee_full_name LIMIT 20`,
      [`%${search.data}%`],
    );
    res.json({ success: true, data: nominations.rows });
  }),
);

router.post(
  "/judges",
  authorize("judges.manage"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        user_uid: z.string().uuid(),
        edition_id: z.number().int().positive(),
        title: z.string().trim().max(150).optional(),
        organisation: z.string().trim().max(190).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid judge",
        errors: input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1 AND status='active' AND is_verified=TRUE AND deleted_at IS NULL FOR UPDATE",
        [input.data.user_uid],
      );
      const edition = await client.query(
        "SELECT id FROM award_editions WHERE id=$1",
        [input.data.edition_id],
      );
      const judgeRole = await client.query<{ id: number }>(
        "SELECT id FROM roles WHERE slug='judge'",
      );
      if (!target.rowCount || !edition.rowCount || !judgeRole.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(404).json({
          success: false,
          message: "Verified active user, edition, or judge role not found",
        });
      }
      const exists = await client.query(
        "SELECT id FROM judges WHERE user_id=$1 AND edition_id=$2",
        [target.rows[0].id, input.data.edition_id],
      );
      if (exists.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "User is already registered as a judge for this edition",
        });
      }
      await client.query(
        "INSERT INTO user_roles(user_id,role_id,assigned_by) VALUES($1,$2,(SELECT id FROM users WHERE uid=$3)) ON CONFLICT(user_id,role_id) DO NOTHING",
        [target.rows[0].id, judgeRole.rows[0].id, req.user!.uid],
      );
      const created = await client.query(
        "INSERT INTO judges(user_id,edition_id,title,organisation,is_active) VALUES($1,$2,$3,$4,TRUE) RETURNING id,user_id,edition_id,title,organisation,is_active",
        [
          target.rows[0].id,
          input.data.edition_id,
          input.data.title ?? null,
          input.data.organisation ?? null,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "judges.created",
        entityType: "judges",
        entityId: String(created.rows[0].id),
        newValues: {
          user_uid: input.data.user_uid,
          edition_id: input.data.edition_id,
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
  "/judges/:id",
  authorize("judges.manage"),
  asyncHandler(async (req, res) => {
    const id = judgeIdSchema.safeParse(req.params.id);
    const input = z
      .object({
        title: z.string().trim().max(150).nullable().optional(),
        organisation: z.string().trim().max(190).nullable().optional(),
        is_active: z.boolean().optional(),
      })
      .strict()
      .refine((v) => Object.values(v).some((value) => value !== undefined))
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid judge update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT title,organisation,is_active FROM judges WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Judge not found" });
      }
      const fields = ["title", "organisation", "is_active"] as const;
      const values: unknown[] = [id.data];
      const sets: string[] = [];
      for (const field of fields)
        if (input.data[field] !== undefined) {
          values.push(input.data[field]);
          sets.push(`${field}=$${values.length}`);
        }
      const updated = await client.query(
        `UPDATE judges SET ${sets.join(",")} WHERE id=$1 RETURNING id,user_id,edition_id,title,organisation,is_active`,
        values,
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "judges.updated",
        entityType: "judges",
        entityId: String(id.data),
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

router.post(
  "/conflicts",
  authorize("conflicts.declare"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        assignment_id: z.string().regex(/^[1-9][0-9]{0,19}$/),
        has_conflict: z.boolean(),
        details: z.string().trim().max(2000).optional(),
      })
      .strict()
      .refine((v) => !v.has_conflict || Boolean(v.details), {
        path: ["details"],
        message: "Explain a declared conflict",
      })
      .safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid conflict declaration",
        errors: input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assignment = await client.query<{
        id: string;
        judge_id: string;
        nomination_id: string;
        uid: string;
        status: string;
      }>(
        "SELECT a.id,a.judge_id,a.nomination_id,u.uid,a.status FROM judge_assignments a JOIN judges j ON j.id=a.judge_id JOIN users u ON u.id=j.user_id WHERE a.id=$1 FOR UPDATE OF a",
        [input.data.assignment_id],
      );
      if (!assignment.rowCount || assignment.rows[0].uid !== req.user!.uid) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Assignment not found" });
      }
      const declaration = await client.query(
        "INSERT INTO conflict_of_interest_declarations(judge_id,nomination_id,has_conflict,details) VALUES($1,$2,$3,$4) RETURNING id,has_conflict,declared_at",
        [
          assignment.rows[0].judge_id,
          assignment.rows[0].nomination_id,
          input.data.has_conflict,
          input.data.details ?? null,
        ],
      );
      if (input.data.has_conflict)
        await client.query(
          "UPDATE judge_assignments SET status='recused' WHERE id=$1",
          [assignment.rows[0].id],
        );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "judges.conflict_declared",
        entityType: "conflict_of_interest_declarations",
        entityId: String(declaration.rows[0].id),
        newValues: {
          has_conflict: input.data.has_conflict,
          assignment_id: assignment.rows[0].id,
        },
      });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: declaration.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/assignments/mine",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT a.id,a.status,a.assigned_at,n.id AS nomination_id,n.reference_no,
            n.nominee_full_name,n.nominee_organisation,n.reason_for_nomination,
            n.achievements,n.business_impact,ac.name AS category,ae.name AS edition
     FROM judges j JOIN judge_assignments a ON a.judge_id=j.id
     JOIN nominations n ON n.id=a.nomination_id
     JOIN edition_categories ec ON ec.id=n.edition_category_id
     JOIN award_categories ac ON ac.id=ec.category_id
     JOIN award_editions ae ON ae.id=ec.edition_id
     JOIN users u ON u.id=j.user_id WHERE u.uid=$1 AND j.is_active=TRUE
     ORDER BY a.assigned_at DESC,a.id DESC`,
      [req.user!.uid],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/assignments",
  authorize("judges.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT a.id,a.status,a.assigned_at,j.id AS judge_id,u.uid AS judge_uid,u.full_name AS judge_name,
            n.id AS nomination_id,n.reference_no,n.nominee_full_name,ae.name AS edition
     FROM judge_assignments a JOIN judges j ON j.id=a.judge_id JOIN users u ON u.id=j.user_id
     JOIN nominations n ON n.id=a.nomination_id JOIN edition_categories ec ON ec.id=n.edition_category_id
     JOIN award_editions ae ON ae.id=ec.edition_id ORDER BY a.assigned_at DESC,a.id DESC LIMIT 500`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/assignments",
  authorize("nominations.assign_judges"),
  asyncHandler(async (req, res) => {
    const input = z
      .object({ judge_id: judgeIdSchema, nomination_id: nominationIdSchema })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid assignment",
        errors: input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const nomination = await client.query<{ edition_id: number }>(
        `SELECT ec.edition_id FROM nominations n JOIN edition_categories ec ON ec.id=n.edition_category_id
       WHERE n.id=$1 AND n.status IN ('submitted','under_review','approved','shortlisted','finalist') FOR UPDATE OF n`,
        [input.data.nomination_id],
      );
      const judge = await client.query(
        "SELECT id FROM judges WHERE id=$1 AND is_active=TRUE AND edition_id=$2",
        [input.data.judge_id, nomination.rows[0]?.edition_id],
      );
      if (!nomination.rowCount || !judge.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(404).json({
          success: false,
          message:
            "Eligible nomination or judge not found for the same edition",
        });
      }
      const exists = await client.query(
        "SELECT id FROM judge_assignments WHERE judge_id=$1 AND nomination_id=$2",
        [input.data.judge_id, input.data.nomination_id],
      );
      if (exists.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "Judge is already assigned to this nomination",
        });
      }
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1",
        [req.user!.uid],
      );
      const created = await client.query(
        `INSERT INTO judge_assignments (judge_id,nomination_id,assigned_by,status)
       VALUES ($1,$2,$3,'assigned') RETURNING id,judge_id,nomination_id,status,assigned_at`,
        [input.data.judge_id, input.data.nomination_id, actor.rows[0].id],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "judging.assignment_created",
        entityType: "judge_assignments",
        entityId: String(created.rows[0].id),
        newValues: {
          judge_id: input.data.judge_id,
          nomination_id: input.data.nomination_id,
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
  "/assignments/:id",
  authorize("nominations.assign_judges"),
  asyncHandler(async (req, res) => {
    const id = assignmentIdSchema.safeParse(req.params.id);
    const input = z
      .object({ judge_id: judgeIdSchema, nomination_id: nominationIdSchema })
      .strict()
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid assignment update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: string;
        judge_id: string;
        nomination_id: string;
      }>(
        "SELECT status,judge_id,nomination_id FROM judge_assignments WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Assignment not found" });
      }
      if (current.rows[0].status !== "assigned") {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "Only unstarted assignments can be changed",
        });
      }
      const nomination = await client.query<{ edition_id: number }>(
        `SELECT ec.edition_id FROM nominations n JOIN edition_categories ec ON ec.id=n.edition_category_id
       WHERE n.id=$1 AND n.status IN ('submitted','under_review','approved','shortlisted','finalist') FOR UPDATE OF n`,
        [input.data.nomination_id],
      );
      const judge = await client.query(
        "SELECT id FROM judges WHERE id=$1 AND is_active=TRUE AND edition_id=$2",
        [input.data.judge_id, nomination.rows[0]?.edition_id],
      );
      if (!nomination.rowCount || !judge.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(404).json({
          success: false,
          message:
            "Eligible nomination or judge not found for the same edition",
        });
      }
      const duplicate = await client.query(
        "SELECT id FROM judge_assignments WHERE judge_id=$1 AND nomination_id=$2 AND id<>$3",
        [input.data.judge_id, input.data.nomination_id, id.data],
      );
      if (duplicate.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "Judge is already assigned to this nomination",
        });
      }
      const updated = await client.query(
        "UPDATE judge_assignments SET judge_id=$2,nomination_id=$3 WHERE id=$1 RETURNING id,judge_id,nomination_id,status,assigned_at",
        [id.data, input.data.judge_id, input.data.nomination_id],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "judging.assignment_updated",
        entityType: "judge_assignments",
        entityId: String(id.data),
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

router.get(
  "/assignments/:id/criteria",
  authorize("evaluations.submit"),
  asyncHandler(async (req, res) => {
    const id = assignmentIdSchema.safeParse(req.params.id);
    if (!id.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid assignment ID" });
    const assignment = await pool.query<{
      status: string;
      edition_category_id: number;
    }>(
      `SELECT a.status,n.edition_category_id FROM judge_assignments a
     JOIN judges j ON j.id=a.judge_id JOIN users u ON u.id=j.user_id
     JOIN nominations n ON n.id=a.nomination_id
     WHERE a.id=$1 AND u.uid=$2 AND j.is_active=TRUE`,
      [id.data, req.user!.uid],
    );
    if (!assignment.rowCount)
      return void res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    if (assignment.rows[0].status === "recused")
      return void res.status(409).json({
        success: false,
        message: "Recused assignments cannot be evaluated",
      });
    const criteria = await pool.query(
      `SELECT ec.id,ec.max_score,ec.weight_percent,
            js.score,js.comment
     FROM evaluation_criteria ec LEFT JOIN judge_scores js
       ON js.criteria_id=ec.id AND js.assignment_id=$2
     WHERE ec.edition_category_id=$1 ORDER BY ec.sort_order,ec.id`,
      [assignment.rows[0].edition_category_id, id.data],
    );
    res.json({
      success: true,
      data: {
        assignment_status: assignment.rows[0].status,
        criteria: criteria.rows,
      },
    });
  }),
);

router.post(
  "/assignments/:id/scores",
  authorize("evaluations.submit"),
  asyncHandler(async (req, res) => {
    const id = assignmentIdSchema.safeParse(req.params.id);
    const input = scoreSubmission.safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid evaluation",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assignment = await client.query<{
        id: string;
        status: string;
        uid: string;
        edition_category_id: number;
      }>(
        `SELECT a.id,a.status,u.uid,n.edition_category_id FROM judge_assignments a
       JOIN judges j ON j.id=a.judge_id JOIN users u ON u.id=j.user_id
       JOIN nominations n ON n.id=a.nomination_id WHERE a.id=$1 FOR UPDATE OF a`,
        [id.data],
      );
      if (!assignment.rowCount || assignment.rows[0].uid !== req.user!.uid) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Assignment not found" });
      }
      if (assignment.rows[0].status === "recused") {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "Recused assignments cannot be scored",
        });
      }
      const criteria = await client.query<{
        id: number;
        max_score: string;
        weight_percent: string;
      }>(
        "SELECT id,max_score,weight_percent FROM evaluation_criteria WHERE edition_category_id=$1 ORDER BY sort_order,id",
        [assignment.rows[0].edition_category_id],
      );
      if (
        !criteria.rowCount ||
        criteria.rowCount !== input.data.scores.length ||
        input.data.scores.some(
          (s) => !criteria.rows.some((c) => c.id === s.criteria_id),
        )
      ) {
        await client.query("ROLLBACK");
        return void res.status(400).json({
          success: false,
          message:
            "Submit one score for every criterion in this nomination category",
        });
      }
      if (
        criteria.rows.some((c) => Number(c.max_score) <= 0) ||
        Math.abs(
          criteria.rows.reduce((sum, c) => sum + Number(c.weight_percent), 0) -
            100,
        ) > 0.01
      ) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message:
            "Evaluation criteria must have positive maximum scores and weights totaling 100%",
        });
      }
      const byId = new Map(criteria.rows.map((c) => [c.id, c]));
      for (const score of input.data.scores)
        if (score.score > Number(byId.get(score.criteria_id)!.max_score)) {
          await client.query("ROLLBACK");
          return void res.status(400).json({
            success: false,
            message: "A score exceeds its criterion maximum",
          });
        }
      const prior = await client.query(
        "SELECT id FROM judge_scores WHERE assignment_id=$1 LIMIT 1",
        [id.data],
      );
      if (prior.rowCount && assignment.rows[0].status === "completed") {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message:
            "Submitted evaluations are final; request an administrator correction",
        });
      }
      if (prior.rowCount)
        await client.query("DELETE FROM judge_scores WHERE assignment_id=$1", [
          id.data,
        ]);
      for (const score of input.data.scores)
        await client.query(
          "INSERT INTO judge_scores (assignment_id,criteria_id,score,comment) VALUES ($1,$2,$3,$4)",
          [id.data, score.criteria_id, score.score, score.comment ?? null],
        );
      await client.query(
        "UPDATE judge_assignments SET status='completed' WHERE id=$1",
        [id.data],
      );
      const weightedScore = input.data.scores.reduce(
        (sum, score) =>
          sum +
          (score.score / Number(byId.get(score.criteria_id)!.max_score)) *
            Number(byId.get(score.criteria_id)!.weight_percent),
        0,
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "judging.evaluation_submitted",
        entityType: "judge_assignments",
        entityId: String(id.data),
        newValues: {
          criteria_count: input.data.scores.length,
          weighted_score: Number(weightedScore.toFixed(2)),
        },
      });
      await client.query("COMMIT");
      res.json({
        success: true,
        data: {
          assignment_id: id.data,
          status: "completed",
          weighted_score: Number(weightedScore.toFixed(2)),
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

export default router;
