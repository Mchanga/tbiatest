import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog } from "../../services/audit.service.js";

const router = Router();
const idSchema = z.string().regex(/^[1-9][0-9]{0,9}$/);
const periodInput = z
  .object({
    edition_category_id: z.number().int().positive(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    is_paid: z.boolean().default(false),
    price_per_vote: z.number().positive().max(1_000_000).nullable().optional(),
    max_votes_per_voter: z.number().int().min(1).max(1000).default(1),
    rules: z.string().max(10_000).nullable().optional(),
    results_visible: z.boolean().default(false),
  })
  .strict()
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    path: ["ends_at"],
    message: "Voting end must follow start",
  });
const castVoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Voting rate limit reached. Try again later.",
  },
});

router.get(
  "/periods",
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT vp.id,vp.edition_category_id,vp.starts_at,vp.ends_at,vp.is_paid,
            vp.price_per_vote,vp.max_votes_per_voter,vp.rules,
            ae.name AS edition,ac.name AS category
     FROM voting_periods vp JOIN edition_categories ec ON ec.id=vp.edition_category_id
     JOIN award_editions ae ON ae.id=ec.edition_id JOIN award_categories ac ON ac.id=ec.category_id
     WHERE vp.starts_at<=NOW() AND vp.ends_at>NOW() AND ec.is_active=TRUE
     ORDER BY vp.starts_at`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.get(
  "/periods/manage",
  authenticate,
  authorize("voting.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT vp.id,vp.edition_category_id,vp.starts_at,vp.ends_at,vp.is_paid,
            vp.price_per_vote,vp.max_votes_per_voter,vp.rules,vp.results_visible,
            ae.name AS edition,ac.name AS category
     FROM voting_periods vp JOIN edition_categories ec ON ec.id=vp.edition_category_id
     JOIN award_editions ae ON ae.id=ec.edition_id JOIN award_categories ac ON ac.id=ec.category_id
     ORDER BY vp.starts_at DESC,vp.id DESC`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.patch(
  "/periods/:id",
  authenticate,
  authorize("voting.manage"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    const input = z
      .object({
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }),
        max_votes_per_voter: z.number().int().min(1).max(1000),
        rules: z.string().max(10_000).nullable().optional(),
        results_visible: z.boolean(),
      })
      .strict()
      .refine((value) => new Date(value.ends_at) > new Date(value.starts_at), {
        path: ["ends_at"],
        message: "Voting end must follow start",
      })
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid voting period update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT starts_at,ends_at,max_votes_per_voter,rules,results_visible FROM voting_periods WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Voting period not found" });
      }
      const updated = await client.query(
        `UPDATE voting_periods SET starts_at=$2,ends_at=$3,max_votes_per_voter=$4,rules=$5,results_visible=$6
       WHERE id=$1 RETURNING id,edition_category_id,starts_at,ends_at,is_paid,price_per_vote,max_votes_per_voter,rules,results_visible`,
        [
          id.data,
          input.data.starts_at,
          input.data.ends_at,
          input.data.max_votes_per_voter,
          input.data.rules ?? null,
          input.data.results_visible,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "voting.period_updated",
        entityType: "voting_periods",
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

router.get(
  "/periods/:id/results",
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid voting period ID" });
    const visible = await pool.query(
      "SELECT results_visible FROM voting_periods WHERE id=$1",
      [id.data],
    );
    if (!visible.rowCount)
      return void res
        .status(404)
        .json({ success: false, message: "Voting period not found" });
    if (!visible.rows[0].results_visible)
      return void res
        .status(403)
        .json({ success: false, message: "Voting results are not public yet" });
    const result = await pool.query(
      `SELECT n.id AS nomination_id,n.reference_no,n.nominee_full_name,n.nominee_photo_path,
            SUM(v.votes_count)::bigint AS votes
     FROM votes v JOIN nominations n ON n.id=v.nomination_id
     WHERE v.voting_period_id=$1 AND v.is_valid=TRUE
     GROUP BY n.id,n.reference_no,n.nominee_full_name,n.nominee_photo_path ORDER BY votes DESC,n.id`,
      [id.data],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/vote",
  authenticate,
  castVoteLimiter,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        voting_period_id: z.number().int().positive(),
        nomination_id: z.string().regex(/^[1-9][0-9]{0,19}$/),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid vote",
        errors: input.error.flatten(),
      });
    const ip = req.ip;
    if (!ip)
      return void res.status(400).json({
        success: false,
        message: "Client network address is unavailable",
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const period = await client.query<{
        starts_at: Date;
        ends_at: Date;
        is_paid: boolean;
        max_votes_per_voter: number;
        edition_category_id: number;
      }>(
        "SELECT starts_at,ends_at,is_paid,max_votes_per_voter,edition_category_id FROM voting_periods WHERE id=$1",
        [input.data.voting_period_id],
      );
      const now = Date.now();
      if (
        !period.rowCount ||
        new Date(period.rows[0].starts_at).getTime() > now ||
        new Date(period.rows[0].ends_at).getTime() <= now
      ) {
        await client.query("ROLLBACK");
        return void res
          .status(409)
          .json({ success: false, message: "Voting period is not open" });
      }
      if (period.rows[0].is_paid) {
        await client.query("ROLLBACK");
        return void res.status(503).json({
          success: false,
          message:
            "Paid voting is unavailable until a verified payment provider integration is installed",
        });
      }
      const voter = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1 AND is_verified=TRUE AND status='active' AND deleted_at IS NULL",
        [req.user!.uid],
      );
      if (!voter.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(403).json({
          success: false,
          message: "A verified active account is required to vote",
        });
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`vote:${input.data.voting_period_id}:${voter.rows[0].id}`],
      );
      const candidate = await client.query(
        `SELECT n.id FROM nominations n JOIN edition_categories ec ON ec.id=n.edition_category_id
       WHERE n.id=$1 AND ec.id=$2 AND ec.is_active=TRUE AND ec.selection_method IN ('public_vote','hybrid')
         AND n.status IN ('shortlisted','finalist')`,
        [input.data.nomination_id, period.rows[0].edition_category_id],
      );
      if (!candidate.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(404).json({
          success: false,
          message: "Nomination is not eligible for this vote",
        });
      }
      const previous = await client.query<{ count: string }>(
        `SELECT COALESCE(SUM(votes_count),0)::text AS count FROM votes
       WHERE voting_period_id=$1 AND voter_user_id=$2 AND is_valid=TRUE`,
        [input.data.voting_period_id, voter.rows[0].id],
      );
      if (
        Number(previous.rows[0].count) >= period.rows[0].max_votes_per_voter
      ) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message: "This voter has reached the voting limit for this period",
        });
      }
      const vote = await client.query(
        `INSERT INTO votes (voting_period_id,nomination_id,voter_user_id,votes_count,ip_address,is_valid)
       VALUES ($1,$2,$3,1,$4::inet,TRUE) RETURNING id,created_at`,
        [
          input.data.voting_period_id,
          input.data.nomination_id,
          voter.rows[0].id,
          ip,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: ip,
        userAgent: req.get("user-agent"),
        action: "voting.vote_cast",
        entityType: "votes",
        entityId: String(vote.rows[0].id),
        newValues: {
          voting_period_id: input.data.voting_period_id,
          nomination_id: input.data.nomination_id,
        },
      });
      await client.query("COMMIT");
      res.status(201).json({
        success: true,
        message: "Vote recorded",
        data: { id: vote.rows[0].id, created_at: vote.rows[0].created_at },
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
  "/fraud-review",
  authenticate,
  authorize("voting.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT voting_period_id,date_trunc('hour',created_at) AS hour,COUNT(*)::int AS ballot_count,
            COUNT(DISTINCT voter_user_id)::int AS distinct_accounts,
            COUNT(DISTINCT nomination_id)::int AS distinct_nominees
     FROM votes WHERE is_valid=TRUE AND created_at>=NOW()-INTERVAL '30 days'
     GROUP BY voting_period_id,date_trunc('hour',created_at)
     HAVING COUNT(*)>=5 ORDER BY hour DESC,ballot_count DESC LIMIT 500`,
    );
    res.json({
      success: true,
      data: result.rows,
      notice:
        "Signals support human review; IP or volume alone is not proof of fraud.",
    });
  }),
);

router.patch(
  "/votes/:id/validity",
  authenticate,
  authorize("voting.manage"),
  asyncHandler(async (req, res) => {
    const id = z
      .string()
      .regex(/^[1-9][0-9]{0,19}$/)
      .safeParse(req.params.id);
    const input = z
      .object({
        is_valid: z.boolean(),
        reason: z.string().trim().min(5).max(255).optional(),
      })
      .strict()
      .refine((v) => v.is_valid || Boolean(v.reason), {
        path: ["reason"],
        message: "Provide a review reason when invalidating a vote",
      })
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid fraud review request",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT is_valid,invalid_reason FROM votes WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Vote not found" });
      }
      const updated = await client.query(
        "UPDATE votes SET is_valid=$2,invalid_reason=$3 WHERE id=$1 RETURNING id,is_valid,invalid_reason",
        [
          id.data,
          input.data.is_valid,
          input.data.is_valid ? null : input.data.reason,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "voting.manual_review",
        entityType: "votes",
        entityId: id.data,
        oldValues: current.rows[0],
        newValues: updated.rows[0],
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
  "/periods",
  authenticate,
  authorize("voting.manage"),
  asyncHandler(async (req, res) => {
    const input = periodInput.safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid voting period",
        errors: input.error.flatten(),
      });
    const v = input.data;
    if (v.is_paid)
      return void res.status(503).json({
        success: false,
        message:
          "Paid voting cannot be enabled until a supported payment provider is integrated and verified",
      });
    const category = await pool.query(
      "SELECT id FROM edition_categories WHERE id=$1 AND is_active=TRUE",
      [v.edition_category_id],
    );
    if (!category.rowCount)
      return void res
        .status(404)
        .json({ success: false, message: "Active edition category not found" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query(
        `INSERT INTO voting_periods (edition_category_id,starts_at,ends_at,is_paid,price_per_vote,max_votes_per_voter,rules,results_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,edition_category_id,starts_at,ends_at,is_paid,price_per_vote,max_votes_per_voter,rules,results_visible`,
        [
          v.edition_category_id,
          v.starts_at,
          v.ends_at,
          v.is_paid,
          v.price_per_vote ?? null,
          v.max_votes_per_voter,
          v.rules ?? null,
          v.results_visible,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "voting.period_created",
        entityType: "voting_periods",
        entityId: String(saved.rows[0].id),
        newValues: {
          edition_category_id: v.edition_category_id,
          is_paid: v.is_paid,
          starts_at: v.starts_at,
          ends_at: v.ends_at,
        },
      });
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        return void res.status(409).json({
          success: false,
          message: "A voting period already exists for this category",
        });
      throw error;
    } finally {
      client.release();
    }
  }),
);

export default router;
