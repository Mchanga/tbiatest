import type { RequestHandler } from "express";
import z from "zod";

import pool from "../../config/database.js";
import asyncHandler from "../../utils/asyncHandler.js";
import {
  createNominationSchema,
  nominationListQuerySchema,
  updateNominationContentSchema,
  updateNominationStatusSchema,
} from "./nominations.validation.js";
import {
  createNewNomination,
  getNomination,
  listAllNominations,
  listMyNominations,
  updateNomination,
  setNominationStatus,
} from "./nominations.service.js";

const auditContext = (req: Parameters<RequestHandler>[0]) => ({
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

const nominationIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);

export const createNomination: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }

    const parsed = createNominationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid nomination payload",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const nomination = await createNewNomination(
      parsed.data,
      req.user.uid,
      auditContext(req),
    );
    res.status(201).json({ success: true, data: nomination });
  },
);

export const listOwnNominations: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }

    const parsed = nominationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid listing query",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const result = await listMyNominations(req.user.uid, parsed.data);
    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: result.total,
        pages: Math.ceil(result.total / parsed.data.limit),
      },
    });
  },
);

export const listAllNominationsForAdmin: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }

    const parsed = nominationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid listing query",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const result = await listAllNominations(parsed.data);
    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: result.total,
        pages: Math.ceil(result.total / parsed.data.limit),
      },
    });
  },
);

export const getNominationById: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }

    const parsed = nominationIdSchema.safeParse(req.params.id);
    if (!parsed.success) {
      res
        .status(400)
        .json({ success: false, message: "Invalid nomination ID" });
      return;
    }

    const permission = await pool.query<{ has_permission: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ANY($1::smallint[])
           AND p.slug = 'nominations.view_all'
       ) AS has_permission`,
      [req.user.roleIds],
    );
    const canViewAll = permission.rows[0]?.has_permission ?? false;
    const nomination = await getNomination(
      parsed.data,
      req.user.uid,
      canViewAll,
    );
    res.json({ success: true, data: nomination });
  },
);

export const updateNominationStatus: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }

    const id = nominationIdSchema.safeParse(req.params.id);
    const parsed = updateNominationStatusSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid nomination status update",
        errors: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }

    const nomination = await setNominationStatus(
      id.data,
      parsed.data,
      req.user.uid,
      auditContext(req),
    );
    res.json({ success: true, data: nomination });
  },
);

export const updateNominationContent: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }
    const id = nominationIdSchema.safeParse(req.params.id);
    const input = updateNominationContentSchema.safeParse(req.body);
    if (!id.success || !input.success) {
      res.status(400).json({
        success: false,
        message: "Invalid nomination update",
        errors: input.success ? undefined : input.error.flatten(),
      });
      return;
    }
    const nomination = await updateNomination(
      id.data,
      input.data,
      req.user.uid,
      auditContext(req),
    );
    res.json({ success: true, data: nomination });
  },
);
