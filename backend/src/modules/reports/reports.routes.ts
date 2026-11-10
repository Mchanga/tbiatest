import { Router } from "express";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";

const router = Router();
router.use(authenticate, authorize("reports.view"));

router.get("/dashboard", asyncHandler(async (_req, res) => {
  const [businesses, nominations, votes, payments, sponsors, events, judges] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM business_profiles WHERE verification_status='approved'"),
    pool.query<{ status: string; count: string }>("SELECT status,COUNT(*)::text AS count FROM nominations GROUP BY status ORDER BY status"),
    pool.query<{ votes: string; distinct_voters: string }>("SELECT COALESCE(SUM(votes_count),0)::text AS votes, COUNT(DISTINCT COALESCE(voter_user_id::text,lower(voter_email::text)))::text AS distinct_voters FROM votes WHERE is_valid=TRUE"),
    pool.query<{ status: string; count: string; amount: string }>("SELECT status,COUNT(*)::text AS count,COALESCE(SUM(amount),0)::text AS amount FROM payments GROUP BY status ORDER BY status"),
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM sponsors WHERE is_published=TRUE"),
    pool.query<{ status: string; count: string }>("SELECT status,COUNT(*)::text AS count FROM events GROUP BY status ORDER BY status"),
    pool.query<{ active: string; assignments: string }>("SELECT COUNT(DISTINCT j.id)::text AS active, (SELECT COUNT(*)::text FROM judge_assignments) AS assignments FROM judges j WHERE j.is_active=TRUE"),
  ]);
  res.json({ success: true, data: {
    approvedBusinesses: Number(businesses.rows[0].count),
    nominationsByStatus: nominations.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
    voting: { votes: Number(votes.rows[0].votes), distinctVoters: Number(votes.rows[0].distinct_voters) },
    paymentsByStatus: payments.rows.map((r) => ({ status: r.status, count: Number(r.count), amount: r.amount })),
    publishedSponsors: Number(sponsors.rows[0].count),
    eventsByStatus: events.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
    judging: { activeJudges: Number(judges.rows[0].active), assignments: Number(judges.rows[0].assignments) },
    generatedAt: new Date().toISOString(),
  } });
}));

router.get("/nominations", asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT ae.id AS edition_id,ae.name AS edition,ac.id AS category_id,ac.name AS category,
            n.status,COUNT(*)::int AS total
     FROM nominations n JOIN edition_categories ec ON ec.id=n.edition_category_id
     JOIN award_editions ae ON ae.id=ec.edition_id JOIN award_categories ac ON ac.id=ec.category_id
     GROUP BY ae.id,ae.name,ac.id,ac.name,n.status ORDER BY ae.id DESC,ac.name,n.status`
  );
  res.json({ success: true, data: result.rows });
}));

router.get("/voting", asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT vp.id AS voting_period_id,ae.name AS edition,ac.name AS category,
            n.id AS nomination_id,n.reference_no,n.nominee_full_name,
            SUM(v.votes_count)::bigint AS vote_count
     FROM voting_periods vp JOIN edition_categories ec ON ec.id=vp.edition_category_id
     JOIN award_editions ae ON ae.id=ec.edition_id JOIN award_categories ac ON ac.id=ec.category_id
     JOIN votes v ON v.voting_period_id=vp.id AND v.is_valid=TRUE
     JOIN nominations n ON n.id=v.nomination_id
     GROUP BY vp.id,ae.name,ac.name,n.id,n.reference_no,n.nominee_full_name
     ORDER BY vote_count DESC`
  );
  res.json({ success: true, data: result.rows });
}));

export default router;
