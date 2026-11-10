import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type RequestHandler } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog, writeAuditLog } from "../../services/audit.service.js";

interface MulterUpload {
  single(fieldName: string): RequestHandler;
}

interface MulterFactory {
  (options?: { storage?: unknown; limits?: { fileSize?: number; files?: number } }): MulterUpload;
  memoryStorage(): unknown;
}

const multer = createRequire(import.meta.url)("multer") as MulterFactory;
const router = Router();
const maxFileSize = 10 * 1024 * 1024;
const storageRoot = process.env.PRIVATE_STORAGE_DIR
  ? path.resolve(process.env.PRIVATE_STORAGE_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", "private-storage");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileSize, files: 1 } });
const relationSchema = z.enum(["business","nomination","judge","sponsor_application","payment","event"]);
const typeSchema = z.enum(["business_registration","business_logo","business_image","nomination_attachment","judge_document","sponsorship_document","payment_receipt","event_image","cms_media"]);
const permissionByRelation: Record<string, string> = {
  business: "businesses.verify", nomination: "nominations.view_all", judge: "judges.manage",
  sponsor_application: "sponsors.manage", payment: "payments.view", event: "events.manage",
};

const detectType = (bytes: Buffer): string | null => {
  if (bytes.length >= 5 && bytes.subarray(0,5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") return "image/webp";
  return null;
};

const canAccess = async (uid: string, relation: string, relatedId: string): Promise<{ allowed: boolean; userId: string | null }> => {
  const user = await pool.query<{ id: string }>("SELECT id FROM users WHERE uid=$1 AND deleted_at IS NULL", [uid]);
  if (!user.rowCount) return { allowed: false, userId: null };
  let owner = false;
  if (relation === "business") {
    const r = await pool.query("SELECT 1 FROM business_profiles WHERE id=$1 AND owner_user_id=$2", [relatedId,user.rows[0].id]); owner = Boolean(r.rowCount);
  } else if (relation === "nomination") {
    const r = await pool.query("SELECT 1 FROM nominations WHERE id=$1 AND nominator_user_id=$2", [relatedId,user.rows[0].id]); owner = Boolean(r.rowCount);
  } else if (relation === "judge") {
    const r = await pool.query("SELECT 1 FROM judges WHERE id=$1 AND user_id=$2 AND is_active=TRUE", [relatedId,user.rows[0].id]); owner = Boolean(r.rowCount);
  }
  if (owner) return { allowed: true, userId: user.rows[0].id };
  const permission = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
       JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=$1 AND p.slug=$2) AS allowed`,
    [user.rows[0].id,permissionByRelation[relation] ?? ""]
  );
  return { allowed: Boolean(permission.rows[0]?.allowed), userId: user.rows[0].id };
};

const safeStoragePath = (key: string): string => {
  const full = path.resolve(storageRoot,key);
  const relative = path.relative(storageRoot,full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw Object.assign(new Error("Invalid stored document path"), { statusCode: 500 });
  return full;
};

router.post("/", authenticate, upload.single("file"), asyncHandler(async (req, res) => {
  const params = z.object({ related_type: relationSchema, related_id: z.string().regex(/^[1-9][0-9]{0,19}$/), doc_type: typeSchema }).strict().safeParse(req.body);
  if (!params.success || !req.file) return void res.status(400).json({ success: false, message: "Provide a valid related entity, document type, and file" });
  if (req.file.size < 1 || req.file.size > maxFileSize) return void res.status(413).json({ success: false, message: "File must be smaller than 10 MB" });
  const actualType = detectType(req.file.buffer);
  if (!actualType) return void res.status(415).json({ success: false, message: "Only PDF, PNG, JPEG, and WebP documents are accepted" });
  const imageType = ["business_logo","business_image","event_image","cms_media"].includes(params.data.doc_type);
  if (imageType && !actualType.startsWith("image/")) return void res.status(415).json({ success: false, message: "This document type requires an image" });
  const access = await canAccess(req.user!.uid,params.data.related_type,params.data.related_id);
  if (!access.allowed || !access.userId) return void res.status(404).json({ success: false, message: "Related record not found or access denied" });
  const key = crypto.randomUUID();
  const destination = safeStoragePath(key);
  const originalName = path.basename(req.file.originalname).replace(/[\x00-\x1f\x7f]/g, "_").slice(0,255) || "upload";
  const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  await fs.mkdir(storageRoot,{ recursive: true,mode: 0o700 });
  await fs.writeFile(destination,req.file.buffer,{ flag: "wx",mode: 0o600 });
  let client: PoolClient;
  try { client = await pool.connect(); }
  catch (error) { await fs.unlink(destination).catch(() => undefined); throw error; }
  try {
    await client.query("BEGIN");
    const saved = await client.query(
      `INSERT INTO documents (uploaded_by,related_type,related_id,doc_type,original_name,storage_path,mime_type,size_bytes,checksum,is_private)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)
       RETURNING id,related_type,related_id,doc_type,original_name,mime_type,size_bytes,checksum,created_at`,
      [access.userId,params.data.related_type,params.data.related_id,params.data.doc_type,originalName,key,actualType,req.file.size,checksum]
    );
    await insertAuditLog(client,{ requestId:req.requestId,ipAddress:req.ip,userAgent:req.get("user-agent"),actorUid:req.user!.uid,action:"documents.uploaded",entityType:"documents",entityId:String(saved.rows[0].id),newValues:{related_type:params.data.related_type,related_id:params.data.related_id,doc_type:params.data.doc_type,mime_type:actualType,size_bytes:req.file.size,checksum} });
    await client.query("COMMIT");
    res.status(201).json({ success:true,data:saved.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); await fs.unlink(destination).catch(()=>undefined); throw error; } finally { client.release(); }
}));

router.get("/:id/download", authenticate, asyncHandler(async (req,res) => {
  const id = z.string().regex(/^[1-9][0-9]{0,19}$/).safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({ success:false,message:"Invalid document ID" });
  const result = await pool.query<{ id:string; uploaded_by:string|null; related_type:string; related_id:string; original_name:string; storage_path:string; mime_type:string|null; is_private:boolean; deleted_at:Date|null }>(
    "SELECT id,uploaded_by,related_type,related_id,original_name,storage_path,mime_type,is_private,deleted_at FROM documents WHERE id=$1",[id.data]
  );
  const doc=result.rows[0];
  if (!doc || doc.deleted_at) return void res.status(404).json({success:false,message:"Document not found"});
  const user = await pool.query<{id:string}>("SELECT id FROM users WHERE uid=$1 AND deleted_at IS NULL",[req.user!.uid]);
  const allowed = Boolean(user.rows[0] && (doc.uploaded_by===user.rows[0].id || (await canAccess(req.user!.uid,doc.related_type,doc.related_id)).allowed));
  if (!allowed) return void res.status(404).json({success:false,message:"Document not found"});
  const storagePath=safeStoragePath(doc.storage_path);
  await fs.access(storagePath);
  await writeAuditLog({requestId:req.requestId,actorUid:req.user!.uid,entityType:"documents",entityId:id.data,action:"documents.accessed",ipAddress:req.ip,userAgent:req.get("user-agent")});
  res.setHeader("X-Content-Type-Options","nosniff");
  res.type(doc.mime_type ?? "application/octet-stream").attachment(doc.original_name).sendFile(storagePath);
}));

router.delete("/:id", authenticate, asyncHandler(async (req,res) => {
  const id=z.string().regex(/^[1-9][0-9]{0,19}$/).safeParse(req.params.id);
  if (!id.success) return void res.status(400).json({success:false,message:"Invalid document ID"});
  const client=await pool.connect();
  let storageKey:string|undefined;
  try {
    await client.query("BEGIN");
    const document=await client.query<{uploaded_by:string|null;related_type:string;related_id:string;storage_path:string;deleted_at:Date|null}>("SELECT uploaded_by,related_type,related_id,storage_path,deleted_at FROM documents WHERE id=$1 FOR UPDATE",[id.data]);
    if (!document.rowCount || document.rows[0].deleted_at) {await client.query("ROLLBACK");return void res.status(404).json({success:false,message:"Document not found"});}
    const user=await client.query<{id:string}>("SELECT id FROM users WHERE uid=$1 AND deleted_at IS NULL",[req.user!.uid]);
    const allowed=Boolean(user.rows[0]&&(document.rows[0].uploaded_by===user.rows[0].id||(await canAccess(req.user!.uid,document.rows[0].related_type,document.rows[0].related_id)).allowed));
    if(!allowed){await client.query("ROLLBACK");return void res.status(404).json({success:false,message:"Document not found"});}
    storageKey=document.rows[0].storage_path;
    await client.query("UPDATE documents SET deleted_at=NOW() WHERE id=$1",[id.data]);
    await insertAuditLog(client,{requestId:req.requestId,ipAddress:req.ip,userAgent:req.get("user-agent"),actorUid:req.user!.uid,action:"documents.deleted",entityType:"documents",entityId:id.data});
    await client.query("COMMIT");
  } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
  if(storageKey) await fs.unlink(safeStoragePath(storageKey)).catch(()=>undefined);
  res.status(204).end();
}));

export default router;
