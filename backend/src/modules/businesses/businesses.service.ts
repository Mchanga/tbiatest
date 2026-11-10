import type { AuditRequestContext } from "../../services/audit.service.js";
import {
  createBusinessProfile,
  getBusinessProfile,
  listBusinessProfiles,
  listOwnedBusinesses,
  setBusinessVerification,
  updateBusinessForReview,
  updateOwnedBusiness,
} from "./businesses.repository.js";
import type {
  BusinessSearchQuery,
  CreateBusinessInput,
  UpdateBusinessInput,
} from "./businesses.validation.js";

export class BusinessServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "BusinessServiceError";
    this.statusCode = statusCode;
  }
}

export const createBusiness = async (
  uid: string,
  accountType: string,
  input: CreateBusinessInput,
  context: AuditRequestContext,
) => {
  if (accountType !== "business") {
    throw new BusinessServiceError(
      "Only business accounts may register a business profile",
      403,
    );
  }
  try {
    return await createBusinessProfile(uid, input, context);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new BusinessServiceError(
        "Registration number is already in use",
        409,
      );
    }
    throw error;
  }
};

export const getMyBusinesses = (uid: string) => listOwnedBusinesses(uid);

export const getPublicBusinesses = (query: BusinessSearchQuery) =>
  listBusinessProfiles(query, true);

export const getBusinessesForReview = (query: BusinessSearchQuery) =>
  listBusinessProfiles(query, false);

export const getBusiness = async (
  id: string,
  ownerUid?: string,
  approvedOnly = false,
) => {
  const business = await getBusinessProfile(id, ownerUid, approvedOnly);
  if (!business)
    throw new BusinessServiceError("Business profile not found", 404);
  return business;
};

export const updateBusiness = async (
  uid: string,
  id: string,
  changes: UpdateBusinessInput,
  context: AuditRequestContext,
) => {
  const business = await updateOwnedBusiness(uid, id, changes, context);
  if (!business)
    throw new BusinessServiceError("Business profile not found", 404);
  return business;
};

export const updateBusinessRecord = async (
  id: string,
  changes: UpdateBusinessInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const business = await updateBusinessForReview(
    id,
    changes,
    actorUid,
    context,
  );
  if (!business)
    throw new BusinessServiceError("Business profile not found", 404);
  return business;
};

export const reviewBusiness = async (
  id: string,
  status: string,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const updated = await setBusinessVerification(id, status, actorUid, context);
  if (!updated)
    throw new BusinessServiceError("Business profile not found", 404);
};
