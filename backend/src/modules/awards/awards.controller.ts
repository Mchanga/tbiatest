import type { RequestHandler } from "express";
import z from "zod";

import asyncHandler from "../../utils/asyncHandler.js";
import {
  createCategorySchema,
  createEditionSchema,
  editionCategorySchema,
  transitionEditionSchema,
  updateCategorySchema,
  updateEditionSchema,
} from "./awards.validation.js";
import {
  addCategory,
  addEdition,
  changeEditionStatus,
  configureCategoryForEdition,
  editCategory,
  editEdition,
  getCategories,
  getEdition,
  getEditions,
} from "./awards.service.js";

const auditContext = (req: Parameters<RequestHandler>[0]) => ({
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

const idSchema = z.string().regex(/^[1-9][0-9]{0,9}$/);

export const listEditions: RequestHandler = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getEditions(false) });
});

export const getEditionById: RequestHandler = asyncHandler(async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ success: false, message: "Invalid edition ID" });
    return;
  }
  res.json({ success: true, data: await getEdition(id.data) });
});

export const createAwardEdition: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const input = createEditionSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ success: false, message: "Invalid edition", errors: input.error.flatten() });
    return;
  }
  const edition = await addEdition(input.data, req.user.uid, auditContext(req));
  res.status(201).json({ success: true, data: edition });
});

export const updateAwardEdition: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const id = idSchema.safeParse(req.params.id);
  const changes = updateEditionSchema.safeParse(req.body);
  if (!id.success || !changes.success) {
    res.status(400).json({ success: false, message: "Invalid edition update", errors: changes.success ? undefined : changes.error.flatten() });
    return;
  }
  const edition = await editEdition(id.data, changes.data, req.user.uid, auditContext(req));
  res.json({ success: true, data: edition });
});

export const updateEditionStatus: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const id = idSchema.safeParse(req.params.id);
  const status = transitionEditionSchema.safeParse(req.body);
  if (!id.success || !status.success) {
    res.status(400).json({ success: false, message: "Invalid edition status", errors: status.success ? undefined : status.error.flatten() });
    return;
  }
  res.json({
    success: true,
    data: await changeEditionStatus(id.data, status.data.status, req.user.uid, auditContext(req)),
  });
});

export const listAwardCategories: RequestHandler = asyncHandler(async (req, res) => {
  const editionId = req.query.edition_id;
  if (editionId !== undefined && (typeof editionId !== "string" || !idSchema.safeParse(editionId).success)) {
    res.status(400).json({ success: false, message: "Invalid edition_id" });
    return;
  }
  res.json({ success: true, data: await getCategories(editionId as string | undefined) });
});

export const createAwardCategory: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const input = createCategorySchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ success: false, message: "Invalid category", errors: input.error.flatten() });
    return;
  }
  const category = await addCategory(input.data, req.user.uid, auditContext(req));
  res.status(201).json({ success: true, data: category });
});

export const updateAwardCategory: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const id = idSchema.safeParse(req.params.id);
  const changes = updateCategorySchema.safeParse(req.body);
  if (!id.success || !changes.success) {
    res.status(400).json({ success: false, message: "Invalid category update", errors: changes.success ? undefined : changes.error.flatten() });
    return;
  }
  const category = await editCategory(id.data, changes.data, req.user.uid, auditContext(req));
  res.json({ success: true, data: category });
});

export const configureEditionCategory: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  const editionId = idSchema.safeParse(req.params.editionId);
  const categoryId = idSchema.safeParse(req.params.categoryId);
  const input = editionCategorySchema.safeParse(req.body);
  if (!editionId.success || !categoryId.success || !input.success) {
    res.status(400).json({ success: false, message: "Invalid edition-category configuration", errors: input.success ? undefined : input.error.flatten() });
    return;
  }
  const config = await configureCategoryForEdition(
    Number(editionId.data),
    Number(categoryId.data),
    input.data,
    req.user.uid,
    auditContext(req)
  );
  res.json({ success: true, data: config });
});