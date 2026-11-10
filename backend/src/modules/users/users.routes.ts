import { Router } from "express";

import authenticate from "../../middleware/authenticate.js";
import authorize from "../../middleware/authorize.js";
import {
  deleteUser,
  getMe,
  getUser,
  getUsers,
  setUserRoles,
  setUserStatus,
  updateUser,
  updateMe,
} from "./users.controller.js";

const router = Router();

router.use(authenticate);
router.get("/me", getMe);
router.patch("/me", updateMe);
router.get("/", authorize("users.view"), getUsers);
router.get("/:uid", authorize("users.view"), getUser);
router.patch("/:uid", authorize("users.manage"), updateUser);
router.patch("/:uid/status", authorize("users.manage"), setUserStatus);
router.put("/:uid/roles", authorize("roles.manage"), setUserRoles);
router.delete("/:uid", authorize("users.delete"), deleteUser);

export default router;
