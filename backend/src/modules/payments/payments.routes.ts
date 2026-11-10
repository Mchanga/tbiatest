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
const providerSchema = z.enum(["mpesa","tigopesa","airtel_money","halopesa","card","bank_transfer","cash","other"]);
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
const callbackSchema = z.object({
  reference_no: z.string().min(1).max(40),
  provider_reference: z.string().min(1).max(120),
  status: z.enum(["successful","failed"]),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  currency: z.string().length(3),
}).strict();
const normalizeAmount = (amount: string): string => {
  const [whole, fraction = ""] = amount.split(".");
  return `${BigInt(whole).toString()}.${fraction.padEnd(2,"0")}`;
};

router.get("/mine", authenticate, authorize("payments.view_own"), asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT p.id,p.reference_no,p.payable_type,p.amount,p.currency,p.provider,p.provider_ref,p.status,p.paid_at,p.created_at,
            r.receipt_no,r.issued_at AS receipt_issued_at
     FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN receipts r ON r.payment_id=p.id
     WHERE u.uid=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 100`, [req.user!.uid]
  );
  res.json({ success: true, data: result.rows });
}));

router.get("/", authenticate, authorize("payments.view"), asyncHandler(async (req, res) => {
  const page = Math.min(100_000, Math.max(1, Number(req.query.page) || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = req.query.status;
  if (status !== undefined && !["pending","successful","failed","refunded","cancelled"].includes(String(status))) return void res.status(400).json({ success: false, message: "Invalid payment status filter" });
  const result = await pool.query(
    `SELECT p.id,p.reference_no,p.user_id,p.payable_type,p.payable_id,p.amount,p.currency,p.provider,p.provider_ref,p.status,p.paid_at,p.created_at
     FROM payments p WHERE ($1::varchar IS NULL OR p.status=$1)
     ORDER BY p.created_at DESC,p.id DESC LIMIT $2 OFFSET $3`,
    [status ?? null,limit,(page-1)*limit]
  );
  const total = await pool.query("SELECT COUNT(*)::int AS total FROM payments WHERE ($1::varchar IS NULL OR status=$1)", [status ?? null]);
  res.json({ success: true, data: result.rows, pagination: { page,limit,total: total.rows[0].total,pages: Math.ceil(total.rows[0].total/limit) } });
}));

router.post("/webhooks/:provider", webhookLimiter, asyncHandler(async (req, res) => {
  const provider = providerSchema.safeParse(req.params.provider);
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const signature = req.get("x-tbia-signature") || "";
  const timestampText = req.get("x-tbia-timestamp") || "";
  const timestamp = Number(timestampText);
  if (!provider.success || !secret || !req.rawBody || !/^\d{10}$/.test(timestampText) || Math.abs(Date.now()/1000-timestamp)>300) return void res.status(401).json({ success: false, message: "Webhook authentication failed" });
  const expected = crypto.createHmac("sha256",secret).update(`${timestampText}.`).update(req.rawBody).digest();
  const providedHex = signature.replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(providedHex)) return void res.status(401).json({ success: false, message: "Webhook authentication failed" });
  const provided = Buffer.from(providedHex,"hex");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided,expected)) return void res.status(401).json({ success: false, message: "Webhook authentication failed" });
  const input = callbackSchema.safeParse(req.body);
  if (!input.success) return void res.status(400).json({ success: false, message: "Invalid payment callback", errors: input.error.flatten() });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payment = await client.query<{ id: string; status: string; provider: string; amount: string; currency: string; provider_ref: string | null }>(
      "SELECT id,status,provider,amount::text,currency,provider_ref FROM payments WHERE reference_no=$1 FOR UPDATE", [input.data.reference_no]
    );
    if (!payment.rowCount) { await client.query("ROLLBACK"); return void res.status(404).json({ success: false, message: "Payment reference not found" }); }
    const current = payment.rows[0];
    if (current.provider !== provider.data || normalizeAmount(current.amount) !== normalizeAmount(input.data.amount) || current.currency.trim().toUpperCase() !== input.data.currency.toUpperCase()) { await client.query("ROLLBACK"); return void res.status(409).json({ success: false, message: "Payment callback does not match the pending transaction" }); }
    if (current.status === "successful") {
      if (input.data.status === "successful" && current.provider_ref === input.data.provider_reference) { await client.query("COMMIT"); return void res.status(200).json({ success: true, duplicate: true }); }
      await client.query("ROLLBACK");
      return void res.status(409).json({ success: false, message: "Payment is already settled" });
    }
    if (current.status === "failed" && input.data.status === "failed" && current.provider_ref === input.data.provider_reference) { await client.query("COMMIT"); return void res.status(200).json({ success: true, duplicate: true }); }
    if (current.status !== "pending") { await client.query("ROLLBACK"); return void res.status(409).json({ success: false, message: "Payment is no longer pending" }); }
    const saved = await client.query(
      `UPDATE payments SET status=$2,provider_ref=$3,paid_at=CASE WHEN $2='successful' THEN NOW() ELSE NULL END,
         raw_response=$4::jsonb WHERE id=$1 RETURNING id,reference_no,status,paid_at`,
      [current.id,input.data.status,input.data.provider_reference,JSON.stringify({ reference_no: input.data.reference_no,provider_reference: input.data.provider_reference,status: input.data.status,amount: input.data.amount,currency: input.data.currency })]
    );
    if (input.data.status === "successful") {
      await client.query(
        `INSERT INTO receipts (payment_id,receipt_no)
         VALUES ($1,$2) ON CONFLICT (payment_id) DO NOTHING`,
        [current.id,`TBIA-R-${new Date().getUTCFullYear()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`]
      );
    }
    await insertAuditLog(client, { requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent"), action: "payments.webhook_processed", entityType: "payments", entityId: current.id, newValues: { status: input.data.status, provider: provider.data } });
    await client.query("COMMIT");
    res.status(200).json({ success: true, data: saved.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));

export default router;
