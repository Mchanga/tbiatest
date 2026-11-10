import type { AuditRequestContext } from "../../services/audit.service.js";
import {
  createNomination,
  getNominationById,
  listNominationRecords,
  updateNominationContent,
  updateNominationStatus,
} from "./nominations.repository.js";
import type {
  CreateNominationInput,
  NominationListQuery,
  UpdateNominationContentInput,
  UpdateNominationStatusInput,
} from "./nominations.validation.js";

export class NominationServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "NominationServiceError";
    this.statusCode = statusCode;
  }
}

export const listMyNominations = (uid: string, query: NominationListQuery) =>
  listNominationRecords(uid, query, false);

export const listAllNominations = (query: NominationListQuery) =>
  listNominationRecords("", query, true);

export const createNewNomination = async (
  input: CreateNominationInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const nomination = await createNomination(input, actorUid, context);
  return nomination;
};

export const getNomination = async (
  id: string,
  actorUid: string,
  canViewAll: boolean,
) => {
  const nomination = await getNominationById(id, actorUid, canViewAll);
  if (!nomination) {
    throw new NominationServiceError("Nomination not found", 404);
  }
  return nomination;
};

export const setNominationStatus = async (
  id: string,
  input: UpdateNominationStatusInput,
  actorUid: string,
  context: AuditRequestContext,
) => {
  const nomination = await updateNominationStatus(id, input, actorUid, context);
  return nomination;
};

export const updateNomination = (
  id: string,
  input: UpdateNominationContentInput,
  actorUid: string,
  context: AuditRequestContext,
) => updateNominationContent(id, input, actorUid, context);
