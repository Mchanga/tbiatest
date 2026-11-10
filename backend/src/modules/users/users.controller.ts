import type { RequestHandler } from "express";
import { z } from "zod";

import asyncHandler from "../../utils/asyncHandler.js";
import pool from "../../config/database.js";
import {
  assignUserRolesSchema,
  listUsersQuerySchema,
  updateOwnProfileSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from "./users.validation.js";
import {
  assignUserRoles,
  changeUserStatus,
  deleteUserAccount,
  getProfile,
  searchUsers,
  updateProfile,
  updateManagedUserProfile,
} from "./users.service.js";

const uidSchema = z.string().uuid();

const auditContext = (req: Parameters<RequestHandler>[0]) => ({
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

export const getMe: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  const [profile, permissions] = await Promise.all([
    getProfile(req.user.uid),
    pool.query<{ slug: string }>(
      `SELECT DISTINCT p.slug
       FROM role_permissions rp
       INNER JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ANY($1::smallint[])`,
      [req.user.roleIds],
    ),
  ]);

  res.json({
    success: true,
    data: {
      ...profile,
      permissions: permissions.rows.map((permission) => permission.slug),
    },
  });
});

export const updateMe: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  const validation = updateOwnProfileSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Invalid profile update",
      errors: validation.error.flatten(),
    });
    return;
  }

  res.json({
    success: true,
    data: await updateProfile(req.user.uid, validation.data, auditContext(req)),
  });
});

export const getUsers: RequestHandler = asyncHandler(async (req, res) => {
  const validation = listUsersQuerySchema.safeParse(req.query);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Invalid user search parameters",
      errors: validation.error.flatten(),
    });
    return;
  }

  const result = await searchUsers(validation.data);
  res.json({
    success: true,
    data: result.data,
    pagination: {
      page: validation.data.page,
      limit: validation.data.limit,
      total: result.total,
      pages: Math.ceil(result.total / validation.data.limit),
    },
  });
});

export const getUser: RequestHandler = asyncHandler(async (req, res) => {
  const uid = uidSchema.safeParse(req.params.uid);
  if (!uid.success) {
    res.status(400).json({ success: false, message: "Invalid user UID" });
    return;
  }

  res.json({ success: true, data: await getProfile(uid.data) });
});

export const setUserStatus: RequestHandler = asyncHandler(async (req, res) => {
  const uid = uidSchema.safeParse(req.params.uid);
  const status = updateUserStatusSchema.safeParse(req.body);
  if (!uid.success || !status.success) {
    res
      .status(400)
      .json({ success: false, message: "Invalid user status request" });
    return;
  }
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  await changeUserStatus(
    uid.data,
    status.data.status,
    req.user.uid,
    auditContext(req),
  );
  res.json({ success: true, message: "User status updated" });
});

export const updateUser: RequestHandler = asyncHandler(async (req, res) => {
  const uid = uidSchema.safeParse(req.params.uid);
  const changes = updateUserSchema.safeParse(req.body);
  if (!uid.success || !changes.success) {
    res.status(400).json({
      success: false,
      message: "Invalid user update",
      errors: changes.success ? undefined : changes.error.flatten(),
    });
    return;
  }
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  res.json({
    success: true,
    data: await updateManagedUserProfile(
      uid.data,
      changes.data,
      req.user.uid,
      auditContext(req),
    ),
  });
});

export const deleteUser: RequestHandler = asyncHandler(async (req, res) => {
  const uid = uidSchema.safeParse(req.params.uid);
  if (!uid.success) {
    res.status(400).json({ success: false, message: "Invalid user UID" });
    return;
  }
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  await deleteUserAccount(uid.data, req.user.uid, auditContext(req));
  res.status(204).end();
});

export const setUserRoles: RequestHandler = asyncHandler(async (req, res) => {
  const uid = uidSchema.safeParse(req.params.uid);
  const roles = assignUserRolesSchema.safeParse(req.body);
  if (!uid.success || !roles.success) {
    res.status(400).json({
      success: false,
      message: "Invalid role assignment request",
      errors: roles.success ? undefined : roles.error.flatten(),
    });
    return;
  }
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  const assignedRoles = await assignUserRoles(
    uid.data,
    roles.data,
    req.user.uid,
    req.user.roleIds,
    auditContext(req),
  );
  res.json({ success: true, data: { uid: uid.data, roles: assignedRoles } });
});
