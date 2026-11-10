import { Router } from "express";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import asyncHandler from "../../utils/asyncHandler.js";
import authorize from "../../middleware/authorize.js";
import { insertAuditLog } from "../../services/audit.service.js";
import { z } from "zod";

const router = Router();
router.use(authenticate);

router.get("/", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const result = await pool.query(
    `SELECT n.id,n.type,n.title,n.body,n.link_url,n.read_at,n.created_at
     FROM notifications n JOIN users u ON u.id=n.user_id
     WHERE u.uid=$1 AND u.deleted_at IS NULL
     ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`,
    [req.user!.uid, limit, (page - 1) * limit]
  );
  res.json({ success: true, data: result.rows, pagination: { page, limit } });
}));

router.patch("/:id/read", asyncHandler(async (req, res) => {
  const rawId = req.params.id;
  const id = typeof rawId === "string" && /^\d{1,20}$/.test(rawId) ? rawId : null;
  if (!id) return void res.status(400).json({ success: false, message: "Invalid notification ID" });
  const result = await pool.query(
    `UPDATE notifications n SET read_at=COALESCE(read_at,NOW())
     FROM users u WHERE n.id=$1 AND n.user_id=u.id AND u.uid=$2 AND u.deleted_at IS NULL
     RETURNING n.id,n.read_at`, [id, req.user!.uid]
  );
  if (!result.rowCount) return void res.status(404).json({ success: false, message: "Notification not found" });
  res.json({ success: true, data: result.rows[0] });
}));

router.patch("/read-all", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `UPDATE notifications n SET read_at=NOW() FROM users u
     WHERE n.user_id=u.id AND u.uid=$1 AND u.deleted_at IS NULL AND n.read_at IS NULL`,
    [req.user!.uid]
  );
  res.json({ success: true, updated: result.rowCount });
}));

router.post("/", authorize("communications.manage"), asyncHandler(async (req, res) => {
  const input = z.object({ user_uid: z.string().uuid(), type: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(190), body: z.string().trim().max(500).optional(), link_url: z.string().regex(/^\/(?!\/)[^\s]*$/).max(255).optional() }).strict().safeParse(req.body);
  if (!input.success) return void res.status(400).json({ success: false, message: "Invalid notification", errors: input.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query<{ id: string }>("SELECT id FROM users WHERE uid=$1 AND deleted_at IS NULL", [input.data.user_uid]);
    if (!target.rowCount) { await client.query("ROLLBACK"); return void res.status(404).json({ success: false, message: "Recipient not found" }); }
    const notification = await client.query(
      `INSERT INTO notifications (user_id,type,title,body,link_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,type,title,body,link_url,created_at`,
      [target.rows[0].id,input.data.type,input.data.title,input.data.body ?? null,input.data.link_url ?? null]
    );
    await insertAuditLog(client, { requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent"), actorUid: req.user!.uid, action: "notifications.created", entityType: "notifications", entityId: String(notification.rows[0].id), newValues: { recipient_uid: input.data.user_uid, type: input.data.type } });
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: notification.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));

export default router;
