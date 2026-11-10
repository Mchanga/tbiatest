import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import pool from "../../config/database.js";
import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog, writeAuditLog } from "../../services/audit.service.js";

interface MulterUpload {
  single(fieldName: string): RequestHandler;
}

interface MulterFactory {
  (options?: {
    storage?: unknown;
    limits?: { fileSize?: number; files?: number };
  }): MulterUpload;
  memoryStorage(): unknown;
}

const multer = createRequire(import.meta.url)("multer") as MulterFactory;
const router = Router();
const maxMediaSize = 10 * 1024 * 1024;
const mediaRoot = process.env.CMS_MEDIA_DIR
  ? path.resolve(process.env.CMS_MEDIA_DIR)
  : path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
      "public-cms-media",
    );
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMediaSize, files: 1 },
});
const authorizeMediaUpload: RequestHandler = async (req, res, next) => {
  if (!req.user)
    return void res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  try {
    const permission = await pool.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
         WHERE rp.role_id=ANY($1::smallint[]) AND p.slug=ANY($2::varchar[])
       ) AS allowed`,
      [
        req.user.roleIds,
        [
          "cms.manage",
          "sponsors.manage",
          "nominations.create",
          "nominations.review",
        ],
      ],
    );
    if (!permission.rows[0]?.allowed)
      return void res.status(403).json({
        success: false,
        message: "You do not have permission to upload this image",
      });
    next();
  } catch (error) {
    next(error);
  }
};
const mediaFilename = z.string().regex(/^[0-9a-f-]{36}\.(?:png|jpg|webp)$/);
const detectImage = (
  bytes: Buffer,
): { mime: string; extension: string } | null => {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { mime: "image/png", extension: "png" };
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return { mime: "image/jpeg", extension: "jpg" };
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return { mime: "image/webp", extension: "webp" };
  return null;
};
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const localizedPage = z
  .object({
    title: z.string().trim().min(2).max(190).optional(),
    content: z.string().max(1_000_000).nullable().optional(),
    meta_title: z.string().trim().max(190).nullable().optional(),
    meta_description: z.string().trim().max(300).nullable().optional(),
  })
  .strict();
const pageSchema = z
  .object({
    slug: slugSchema,
    title: z.string().trim().min(2).max(190),
    content: z.string().max(1_000_000).nullable().optional(),
    meta_title: z.string().trim().max(190).nullable().optional(),
    meta_description: z.string().trim().max(300).nullable().optional(),
    is_published: z.boolean().optional(),
    translations: z
      .object({ en: localizedPage.optional(), sw: localizedPage.optional() })
      .strict()
      .optional(),
  })
  .strict();

router.get(
  "/media/:filename",
  asyncHandler(async (req, res) => {
    const filename = mediaFilename.safeParse(req.params.filename);
    if (!filename.success)
      return void res
        .status(404)
        .json({ success: false, message: "Media not found" });
    const filePath = path.resolve(mediaRoot, filename.data);
    try {
      await fs.access(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return void res
          .status(404)
          .json({ success: false, message: "Media not found" });
      throw error;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res
      .type(
        path.extname(filename.data) === ".png"
          ? "image/png"
          : path.extname(filename.data) === ".webp"
            ? "image/webp"
            : "image/jpeg",
      )
      .sendFile(filePath);
  }),
);

router.post(
  "/media",
  authenticate,
  authorizeMediaUpload,
  imageUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file || req.file.size < 1 || req.file.size > maxMediaSize)
      return void res.status(400).json({
        success: false,
        message: "Select an image smaller than 10 MB",
      });
    const image = detectImage(req.file.buffer);
    if (!image)
      return void res.status(415).json({
        success: false,
        message: "Only PNG, JPEG, and WebP images are accepted",
      });
    const filename = `${crypto.randomUUID()}.${image.extension}`;
    await fs.mkdir(mediaRoot, { recursive: true, mode: 0o755 });
    const filePath = path.resolve(mediaRoot, filename);
    await fs.writeFile(filePath, req.file.buffer, {
      flag: "wx",
      mode: 0o644,
    });
    try {
      await writeAuditLog({
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "cms.media_uploaded",
        entityType: "cms_media",
        entityId: filename,
        newValues: { mime_type: image.mime, size_bytes: req.file.size },
      });
    } catch (error) {
      await fs.unlink(filePath);
      throw error;
    }
    res.status(201).json({
      success: true,
      data: { filename, url: `/cms/media/${filename}` },
    });
  }),
);

router.get(
  "/public/:slug",
  asyncHandler(async (req, res) => {
    const slug = slugSchema.safeParse(req.params.slug);
    const language = z.enum(["en", "sw"]).safeParse(req.query.lang ?? "en");
    if (!slug.success || !language.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid page slug or language" });
    const result = await pool.query(
      `SELECT slug,
            COALESCE(translations->$2::text->>'title',title) AS title,
            COALESCE(translations->$2::text->>'content',content) AS content,
            COALESCE(translations->$2::text->>'meta_title',meta_title) AS meta_title,
            COALESCE(translations->$2::text->>'meta_description',meta_description) AS meta_description,
            CASE WHEN translations ? $2::text THEN $2::text ELSE 'en' END AS language,updated_at
     FROM cms_pages WHERE slug = $1 AND is_published = TRUE LIMIT 1`,
      [slug.data, language.data],
    );
    if (!result.rowCount)
      return void res
        .status(404)
        .json({ success: false, message: "Page not found" });
    res.json({ success: true, data: result.rows[0] });
  }),
);

router.get(
  "/",
  authenticate,
  authorize("cms.view"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, slug, title, content, meta_title, meta_description, translations, is_published, updated_by, updated_at
     FROM cms_pages ORDER BY slug`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/",
  authenticate,
  authorize("cms.manage"),
  asyncHandler(async (req, res) => {
    const input = pageSchema.safeParse(req.body);
    if (!input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid page",
        errors: input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1 AND deleted_at IS NULL",
        [req.user!.uid],
      );
      if (!actor.rowCount)
        throw Object.assign(new Error("User not found"), { statusCode: 401 });
      const saved = await client.query(
        `INSERT INTO cms_pages (slug,title,content,meta_title,meta_description,translations,is_published,updated_by,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,NOW())
       RETURNING id,slug,title,content,meta_title,meta_description,translations,is_published,updated_at`,
        [
          input.data.slug,
          input.data.title,
          input.data.content ?? null,
          input.data.meta_title ?? null,
          input.data.meta_description ?? null,
          JSON.stringify(input.data.translations ?? {}),
          input.data.is_published ?? false,
          actor.rows[0].id,
        ],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "cms.page_created",
        entityType: "cms_pages",
        entityId: String(saved.rows[0].id),
        newValues: {
          slug: input.data.slug,
          title: input.data.title,
          is_published: input.data.is_published ?? false,
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
        return void res
          .status(409)
          .json({ success: false, message: "Page slug already exists" });
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/:id",
  authenticate,
  authorize("cms.manage"),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const input = pageSchema
      .partial()
      .strict()
      .refine((data) => Object.keys(data).length > 0)
      .safeParse(req.body);
    if (!id.success || !input.success)
      return void res.status(400).json({
        success: false,
        message: "Invalid page update",
        errors: input.success ? undefined : input.error.flatten(),
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1 AND deleted_at IS NULL",
        [req.user!.uid],
      );
      const current = await client.query(
        "SELECT slug,title,is_published FROM cms_pages WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!actor.rowCount || !current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Page not found" });
      }
      const fields = [
        "slug",
        "title",
        "content",
        "meta_title",
        "meta_description",
        "translations",
        "is_published",
      ] as const;
      const values: unknown[] = [id.data];
      const sets: string[] = [];
      for (const field of fields)
        if (input.data[field] !== undefined) {
          values.push(
            field === "translations"
              ? JSON.stringify(input.data[field])
              : input.data[field],
          );
          sets.push(
            `${field}=$${values.length}${field === "translations" ? "::jsonb" : ""}`,
          );
        }
      values.push(actor.rows[0].id);
      sets.push(`updated_by=$${values.length}`, "updated_at=NOW()");
      const saved = await client.query(
        `UPDATE cms_pages SET ${sets.join(",")} WHERE id=$1 RETURNING id,slug,title,content,meta_title,meta_description,translations,is_published,updated_at`,
        values,
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "cms.page_updated",
        entityType: "cms_pages",
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
  "/:id",
  authenticate,
  authorize("cms.manage"),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid page ID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        "SELECT slug,title,is_published FROM cms_pages WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!previous.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Page not found" });
      }
      const actor = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE uid=$1",
        [req.user!.uid],
      );
      const removed = await client.query(
        "UPDATE cms_pages SET is_published=FALSE,updated_by=$2,updated_at=NOW() WHERE id=$1 RETURNING slug,title,is_published",
        [id.data, actor.rows[0].id],
      );
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "cms.page_unpublished",
        entityType: "cms_pages",
        entityId: String(id.data),
        oldValues: previous.rows[0],
        newValues: removed.rows[0],
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

export default router;
