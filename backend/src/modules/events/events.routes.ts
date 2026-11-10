import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog } from "../../services/audit.service.js";

const router = Router();
const ticketOrderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const idSchema = z.coerce.number().int().positive();
const eventInput = z.object({
  edition_id: z.number().int().positive(),
  title: z.string().trim().min(2).max(190),
  slug: z.string().trim().min(2).max(190).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(100_000).nullable().optional(),
  venue: z.string().trim().max(255).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  is_grand_finale: z.boolean().optional(),
  ticketing_enabled: z.boolean().optional(),
  status: z.enum(["draft", "published", "sold_out", "completed", "cancelled"]).optional(),
}).strict().refine((v) => !v.ends_at || new Date(v.ends_at) > new Date(v.starts_at), { path: ["ends_at"], message: "Event end must be after its start" });

const ticketTypeInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  price: z.number().min(0).max(1_000_000_000),
  currency: z.string().length(3).default("TZS"),
  quantity: z.number().int().positive().nullable().optional(),
  sales_start: z.string().datetime({ offset: true }).nullable().optional(),
  sales_end: z.string().datetime({ offset: true }).nullable().optional(),
}).strict().refine((v) => !v.sales_start || !v.sales_end || new Date(v.sales_end) > new Date(v.sales_start), { path: ["sales_end"], message: "Ticket sales end must follow start" });

router.get("/", asyncHandler(async (_req, res) => {
  const events = await pool.query(
    `SELECT id,edition_id,title,slug,description,venue,address,starts_at,ends_at,is_grand_finale,ticketing_enabled
     FROM events WHERE status='published' ORDER BY starts_at ASC`
  );
  res.json({ success: true, data: events.rows });
}));

router.get("/manage", authenticate, authorize("events.manage"), asyncHandler(async (_req, res) => {
  const events = await pool.query("SELECT * FROM events ORDER BY starts_at DESC,id DESC");
  res.json({ success: true, data: events.rows });
}));

router.post("/", authenticate, authorize("events.manage"), asyncHandler(async (req, res) => {
  const input = eventInput.safeParse(req.body);
  if (!input.success) return void res.status(400).json({ success: false, message: "Invalid event", errors: input.error.flatten() });
  const v = input.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await client.query(
      `INSERT INTO events (edition_id,title,slug,description,venue,address,starts_at,ends_at,is_grand_finale,ticketing_enabled,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,edition_id,title,slug,description,venue,address,starts_at,ends_at,is_grand_finale,ticketing_enabled,status`,
      [v.edition_id,v.title,v.slug,v.description ?? null,v.venue ?? null,v.address ?? null,v.starts_at,v.ends_at ?? null,v.is_grand_finale ?? false,v.ticketing_enabled ?? false,v.status ?? "draft"]
    );
    await insertAuditLog(client, { requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent"), actorUid: req.user!.uid, action: "events.created", entityType: "events", entityId: String(saved.rows[0].id), newValues: { title: v.title, slug: v.slug, status: v.status ?? "draft" } });
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: saved.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return void res.status(409).json({ success: false, message: "Event slug already exists" }); throw error; } finally { client.release(); }
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({ success: false, message: "Invalid event ID" });
  const event = await pool.query(
    `SELECT id,edition_id,title,slug,description,venue,address,starts_at,ends_at,is_grand_finale,ticketing_enabled
     FROM events WHERE id=$1 AND status='published' LIMIT 1`, [id.data]
  );
  if (!event.rowCount) return void res.status(404).json({ success: false, message: "Event not found" });
  const types = await pool.query(
    `SELECT id,name,description,price,currency,quantity,sold,sales_start,sales_end
     FROM ticket_types WHERE event_id=$1 AND is_active=TRUE ORDER BY price,id`, [id.data]
  );
  res.json({ success: true, data: { ...event.rows[0], ticketTypes: types.rows } });
}));

router.patch("/:id", authenticate, authorize("events.manage"), asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const input = eventInput.partial().strict().refine((v) => Object.keys(v).length > 0).safeParse(req.body);
  if (!id.success || !input.success) return void res.status(400).json({ success: false, message: "Invalid event update", errors: input.success ? undefined : input.error.flatten() });
  const fields = ["edition_id","title","slug","description","venue","address","starts_at","ends_at","is_grand_finale","ticketing_enabled","status"] as const;
  const values: unknown[] = [id.data];
  const sets: string[] = [];
  for (const f of fields) if (input.data[f] !== undefined) { values.push(input.data[f]); sets.push(`${f}=$${values.length}`); }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM events WHERE id=$1 FOR UPDATE", [id.data]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return void res.status(404).json({ success: false, message: "Event not found" }); }
    const nextStart = input.data.starts_at ?? current.rows[0].starts_at;
    const nextEnd = input.data.ends_at === undefined ? current.rows[0].ends_at : input.data.ends_at;
    if (nextEnd && new Date(nextEnd) <= new Date(nextStart)) {
      await client.query("ROLLBACK");
      return void res.status(400).json({ success: false, message: "Event end must be after its start" });
    }
    const updated = await client.query(`UPDATE events SET ${sets.join(",")} WHERE id=$1 RETURNING *`, values);
    await insertAuditLog(client, { requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent"), actorUid: req.user!.uid, action: "events.updated", entityType: "events", entityId: String(id.data), oldValues: { title: current.rows[0].title, status: current.rows[0].status }, newValues: input.data as Record<string, unknown> });
    await client.query("COMMIT");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));

router.post("/:id/ticket-types", authenticate, authorize("events.manage"), asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const input = ticketTypeInput.safeParse(req.body);
  if (!id.success || !input.success) return void res.status(400).json({ success: false, message: "Invalid ticket type", errors: input.success ? undefined : input.error.flatten() });
  const event = await pool.query("SELECT id FROM events WHERE id=$1", [id.data]);
  if (!event.rowCount) return void res.status(404).json({ success: false, message: "Event not found" });
  const v = input.data;
  const saved = await pool.query(
    `INSERT INTO ticket_types (event_id,name,description,price,currency,quantity,sales_start,sales_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id,event_id,name,description,price,currency,quantity,sold,sales_start,sales_end,is_active`,
    [id.data,v.name,v.description ?? null,v.price,v.currency,v.quantity ?? null,v.sales_start ?? null,v.sales_end ?? null]
  );
  res.status(201).json({ success: true, data: saved.rows[0] });
}));

router.post("/:id/orders", ticketOrderLimiter, asyncHandler(async (req, res) => {
  const eventId = idSchema.safeParse(req.params.id);
  const input = z.object({
    buyer_name: z.string().trim().min(2).max(150),
    buyer_email: z.string().trim().email().max(254),
    buyer_phone: z.string().trim().max(30).optional(),
    items: z.array(z.object({
      ticket_type_id: z.number().int().positive(),
      quantity: z.number().int().min(1).max(10),
      holder_names: z.array(z.string().trim().min(2).max(150)).optional(),
    }).strict().refine((i) => !i.holder_names || i.holder_names.length === i.quantity, { message: "Provide one holder name per ticket" })).min(1).max(5),
  }).strict().refine((v) => new Set(v.items.map((i) => i.ticket_type_id)).size === v.items.length, { message: "Ticket types must be unique in an order" }).safeParse(req.body);
  if (!eventId.success || !input.success) return void res.status(400).json({ success: false, message: "Invalid ticket order", errors: input.success ? undefined : input.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const event = await client.query<{ ticketing_enabled: boolean; status: string }>("SELECT ticketing_enabled,status FROM events WHERE id=$1 FOR SHARE", [eventId.data]);
    if (!event.rowCount || event.rows[0].status !== "published" || !event.rows[0].ticketing_enabled) { await client.query("ROLLBACK"); return void res.status(404).json({ success: false, message: "Ticket sales are unavailable for this event" }); }
    const typeIds = input.data.items.map((item) => item.ticket_type_id);
    const types = await client.query<{ id: number; name: string; price: string; currency: string; quantity: number | null; sold: number; sales_start: Date | null; sales_end: Date | null }>(
      "SELECT id,name,price::text,currency,quantity,sold,sales_start,sales_end FROM ticket_types WHERE event_id=$1 AND id=ANY($2::int[]) AND is_active=TRUE FOR UPDATE", [eventId.data,typeIds]
    );
    if (types.rowCount !== typeIds.length) { await client.query("ROLLBACK"); return void res.status(400).json({ success: false, message: "One or more ticket types are unavailable" }); }
    const now = Date.now();
    for (const item of input.data.items) {
      const type = types.rows.find((row) => row.id === item.ticket_type_id)!;
      if (type.price !== "0.00" && Number(type.price) !== 0) { await client.query("ROLLBACK"); return void res.status(503).json({ success: false, message: "Paid ticket checkout is unavailable until a payment provider is integrated" }); }
      if ((type.sales_start && new Date(type.sales_start).getTime() > now) || (type.sales_end && new Date(type.sales_end).getTime() <= now)) { await client.query("ROLLBACK"); return void res.status(409).json({ success: false, message: `Sales are closed for ticket type ${type.name}` }); }
      if (type.quantity !== null && type.sold + item.quantity > type.quantity) { await client.query("ROLLBACK"); return void res.status(409).json({ success: false, message: `Not enough tickets remain for ${type.name}` }); }
    }
    const orderNo = `TKT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const order = await client.query<{ id: string }>(
      `INSERT INTO ticket_orders (order_no,buyer_name,buyer_email,buyer_phone,total_amount,status)
       VALUES ($1,$2,$3,$4,0,'paid') RETURNING id`,
      [orderNo,input.data.buyer_name,input.data.buyer_email.toLowerCase(),input.data.buyer_phone ?? null]
    );
    const issued: Array<{ ticket_code: string; holder_name: string | null; ticket_type: string; qr_token: string }> = [];
    for (const item of input.data.items) {
      const type = types.rows.find((row) => row.id === item.ticket_type_id)!;
      const updated = await client.query("UPDATE ticket_types SET sold=sold+$2 WHERE id=$1 AND (quantity IS NULL OR sold+$2<=quantity)", [type.id,item.quantity]);
      if (!updated.rowCount) throw Object.assign(new Error("Ticket inventory changed while processing the order"), { statusCode: 409 });
      for (let i=0;i<item.quantity;i++) {
        const qrToken = crypto.randomBytes(32).toString("hex");
        const ticketCode = `TBIA-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
        await client.query("INSERT INTO tickets (order_id,ticket_type_id,ticket_code,qr_token,holder_name) VALUES ($1,$2,$3,$4,$5)", [order.rows[0].id,type.id,ticketCode,crypto.createHash("sha256").update(qrToken).digest("hex"),item.holder_names?.[i] ?? null]);
        issued.push({ ticket_code: ticketCode,holder_name: item.holder_names?.[i] ?? null,ticket_type: type.name,qr_token: qrToken });
      }
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { order_no: orderNo,status: "paid",tickets: issued }, message: "Free tickets issued. Save the QR tokens; they are shown only once." });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));

router.post("/check-in", authenticate, authorize("tickets.checkin"), asyncHandler(async (req, res) => {
  const input = z.object({ qr_token: z.string().regex(/^[a-f0-9]{64}$/i) }).strict().safeParse(req.body);
  if (!input.success) return void res.status(400).json({ success: false, message: "Invalid ticket token" });
  const hash = crypto.createHash("sha256").update(input.data.qr_token).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ticket = await client.query<{ id: string; status: string; order_id: string; ticket_type_id: number; checked_in_at: Date | null }>("SELECT id,status,order_id,ticket_type_id,checked_in_at FROM tickets WHERE qr_token=$1 FOR UPDATE", [hash]);
    if (!ticket.rowCount) { await client.query("ROLLBACK"); return void res.status(404).json({ success: false, message: "Ticket is invalid" }); }
    if (ticket.rows[0].status !== "valid" || ticket.rows[0].checked_in_at) { await client.query("ROLLBACK"); return void res.status(409).json({ success: false, message: "Ticket has already been used or cancelled" }); }
    const user = await client.query<{ id: string }>("SELECT id FROM users WHERE uid=$1", [req.user!.uid]);
    const updated = await client.query("UPDATE tickets SET status='used',checked_in_at=NOW(),checked_in_by=$2 WHERE id=$1 RETURNING id,ticket_code,status,checked_in_at", [ticket.rows[0].id,user.rows[0].id]);
    await insertAuditLog(client, { requestId: req.requestId, ipAddress: req.ip, userAgent: req.get("user-agent"), actorUid: req.user!.uid, action: "tickets.checked_in", entityType: "tickets", entityId: ticket.rows[0].id, newValues: { ticket_type_id: ticket.rows[0].ticket_type_id } });
    await client.query("COMMIT");
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));

export default router;
