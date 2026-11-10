import { Router } from "express";
import { z } from "zod";

import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import {
  configureEditionCategory,
  createAwardCategory,
  createAwardEdition,
  getEditionById,
  listAwardCategories,
  listEditions,
  updateAwardCategory,
  updateAwardEdition,
  updateEditionStatus,
} from "./awards.controller.js";
import pool from "../../config/database.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { insertAuditLog } from "../../services/audit.service.js";

const router = Router();

router.get("/editions", listEditions);
router.get("/editions/:id", getEditionById);
router.post(
  "/editions",
  authenticate,
  authorize("awards.manage"),
  createAwardEdition,
);
router.patch(
  "/editions/:id",
  authenticate,
  authorize("awards.manage"),
  updateAwardEdition,
);
router.patch(
  "/editions/:id/status",
  authenticate,
  authorize("awards.manage"),
  updateEditionStatus,
);

router.get("/categories", listAwardCategories);
router.get(
  "/category-groups",
  authenticate,
  authorize("categories.manage"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      "SELECT id,name FROM category_groups ORDER BY name",
    );
    res.json({ success: true, data: result.rows });
  }),
);
router.get(
  "/edition-categories",
  asyncHandler(async (req, res) => {
    const purpose = z
      .enum(["nomination"])
      .optional()
      .safeParse(req.query.purpose);
    if (!purpose.success) {
      res
        .status(400)
        .json({ success: false, message: "Invalid category lookup purpose" });
      return;
    }
    const result = await pool.query(
      `SELECT ec.id AS edition_category_id,ec.edition_id,ae.name AS edition_name,
              c.id AS category_id,c.name AS category_name,c.slug
       FROM edition_categories ec
       JOIN award_editions ae ON ae.id=ec.edition_id
       JOIN award_categories c ON c.id=ec.category_id
       WHERE ec.is_active=TRUE
         AND ($1::boolean=FALSE OR ae.status='nominations_open')
       ORDER BY ae.year DESC,c.sort_order,c.name`,
      [purpose.data === "nomination"],
    );
    res.json({ success: true, data: result.rows });
  }),
);
router.post(
  "/categories",
  authenticate,
  authorize("categories.manage"),
  createAwardCategory,
);
router.patch(
  "/categories/:id",
  authenticate,
  authorize("categories.manage"),
  updateAwardCategory,
);
router.delete(
  "/categories/:id",
  authenticate,
  authorize("categories.manage"),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success)
      return void res
        .status(400)
        .json({ success: false, message: "Invalid category ID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id,name FROM award_categories WHERE id=$1 FOR UPDATE",
        [id.data],
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return void res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }
      const assignments = await client.query(
        "SELECT 1 FROM edition_categories WHERE category_id=$1 LIMIT 1",
        [id.data],
      );
      if (assignments.rowCount) {
        await client.query("ROLLBACK");
        return void res.status(409).json({
          success: false,
          message:
            "This category is assigned to an award edition and cannot be deleted",
        });
      }
      await client.query("DELETE FROM award_categories WHERE id=$1", [id.data]);
      await insertAuditLog(client, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        actorUid: req.user!.uid,
        action: "awards.category_deleted",
        entityType: "award_categories",
        entityId: String(id.data),
        oldValues: current.rows[0],
      });
      await client.query("COMMIT");
      res.status(204).end();
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23503"
      ) {
        return void res.status(409).json({
          success: false,
          message: "This category is in use and cannot be deleted",
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);
router.put(
  "/editions/:editionId/categories/:categoryId",
  authenticate,
  authorize("categories.manage"),
  configureEditionCategory,
);

export default router;
