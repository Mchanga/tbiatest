import { Router } from "express";

import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import {
  create,
  getOne,
  listForReview,
  listMine,
  listPublic,
  updateForReview,
  updateMine,
  verify,
} from "./businesses.controller.js";

const router = Router();

router.get("/", listPublic);
router.get(
  "/review",
  authenticate,
  authorize("businesses.verify"),
  listForReview,
);
router.post("/", authenticate, create);
router.get("/mine", authenticate, listMine);
router.get("/:id", getOne);
router.patch(
  "/:id/manage",
  authenticate,
  authorize("businesses.verify"),
  updateForReview,
);
router.patch("/:id", authenticate, updateMine);
router.patch(
  "/:id/verification",
  authenticate,
  authorize("businesses.verify"),
  verify,
);

export default router;
