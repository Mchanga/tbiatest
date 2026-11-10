import type { RequestHandler } from "express";
import z from "zod";

import asyncHandler from "../../utils/asyncHandler.js";
import {
  businessSearchSchema,
  businessVerificationSchema,
  createBusinessSchema,
  updateBusinessSchema,
} from "./businesses.validation.js";
import {
  createBusiness,
  getBusiness,
  getBusinessesForReview,
  getMyBusinesses,
  getPublicBusinesses,
  reviewBusiness,
  updateBusinessRecord,
  updateBusiness,
} from "./businesses.service.js";

const businessIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

const auditContext = (req: Parameters<RequestHandler>[0]) => ({
  requestId: req.requestId,
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

const getSearch = (
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
) => {
  const parsed = businessSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid business search parameters",
      errors: parsed.error.flatten(),
    });
    return null;
  }
  return parsed.data;
};

export const create: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }
  const parsed = createBusinessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid business profile",
      errors: parsed.error.flatten(),
    });
    return;
  }
  const business = await createBusiness(
    req.user.uid,
    req.user.accountType,
    parsed.data,
    auditContext(req),
  );
  res.status(201).json({ success: true, data: business });
});

export const listMine: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }
  res.json({ success: true, data: await getMyBusinesses(req.user.uid) });
});

export const listPublic: RequestHandler = asyncHandler(async (req, res) => {
  const query = getSearch(req, res);
  if (!query) return;
  const result = await getPublicBusinesses(query);
  res.json({
    success: true,
    data: result.data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      pages: Math.ceil(result.total / query.limit),
    },
  });
});

export const listForReview: RequestHandler = asyncHandler(async (req, res) => {
  const query = getSearch(req, res);
  if (!query) return;
  const result = await getBusinessesForReview(query);
  res.json({
    success: true,
    data: result.data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      pages: Math.ceil(result.total / query.limit),
    },
  });
});

export const getOne: RequestHandler = asyncHandler(async (req, res) => {
  const id = businessIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ success: false, message: "Invalid business ID" });
    return;
  }
  const ownerUid = req.user?.uid;
  const business = await getBusiness(id.data, ownerUid, !ownerUid);
  res.json({ success: true, data: business });
});

export const updateMine: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }
  const id = businessIdSchema.safeParse(req.params.id);
  const changes = updateBusinessSchema.safeParse(req.body);
  if (!id.success || !changes.success) {
    res.status(400).json({
      success: false,
      message: "Invalid business update",
      errors: changes.success ? undefined : changes.error.flatten(),
    });
    return;
  }
  const business = await updateBusiness(
    req.user.uid,
    id.data,
    changes.data,
    auditContext(req),
  );
  res.json({ success: true, data: business });
});

export const updateForReview: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res
        .status(401)
        .json({ success: false, message: "Authentication required" });
      return;
    }
    const id = businessIdSchema.safeParse(req.params.id);
    const changes = updateBusinessSchema.safeParse(req.body);
    if (!id.success || !changes.success) {
      res.status(400).json({
        success: false,
        message: "Invalid business update",
        errors: changes.success ? undefined : changes.error.flatten(),
      });
      return;
    }
    const business = await updateBusinessRecord(
      id.data,
      changes.data,
      req.user.uid,
      auditContext(req),
    );
    res.json({ success: true, data: business });
  },
);

export const verify: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) {
    res
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }
  const id = businessIdSchema.safeParse(req.params.id);
  const status = businessVerificationSchema.safeParse(req.body);
  if (!id.success || !status.success) {
    res.status(400).json({
      success: false,
      message: "Invalid business verification request",
      errors: status.success ? undefined : status.error.flatten(),
    });
    return;
  }
  await reviewBusiness(
    id.data,
    status.data.verification_status,
    req.user.uid,
    auditContext(req),
  );
  res.json({ success: true, message: "Business verification status updated" });
});
