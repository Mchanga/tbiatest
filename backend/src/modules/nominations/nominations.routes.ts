import { Router } from "express";
import { z } from "zod";
import pool from "../../config/database.js";

import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
  createNomination,
  getNominationById,
  listAllNominationsForAdmin,
  listOwnNominations,
  updateNominationContent,
  updateNominationStatus,
} from "./nominations.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("nominations.create"),
  createNomination,
);
router.get(
  "/mine",
  authenticate,
  authorize("nominations.view_own"),
  listOwnNominations,
);
router.get(
  "/review",
  authenticate,
  authorize("nominations.view_all"),
  listAllNominationsForAdmin,
);
router.get(
  "/nominee-users",
  authenticate,
  authorize("nominations.create"),
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
      `SELECT id,full_name,account_type
       FROM users
       WHERE deleted_at IS NULL AND status='active' AND is_verified=TRUE
         AND full_name ILIKE $1
       ORDER BY full_name LIMIT 20`,
      [`%${search.data}%`],
    );
    res.json({ success: true, data: users.rows });
  }),
);
router.patch(
  "/:id",
  authenticate,
  authorize("nominations.review"),
  updateNominationContent,
);
router.get("/:id", authenticate, getNominationById);
router.patch(
  "/:id/status",
  authenticate,
  authorize("nominations.change_status"),
  updateNominationStatus,
);

export default router;
