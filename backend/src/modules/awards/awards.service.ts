import type { AuditRequestContext } from "../../services/audit.service.js";
import {
  configureEditionCategory,
  createCategory,
  createEdition,
  getEditionById,
  listCategories,
  listEditions,
  transitionEditionStatus,
  updateCategory,
  updateEdition,
} from "./awards.repository.js";
import type {
  CreateCategoryInput,
  CreateEditionInput,
  EditionCategoryInput,
  UpdateCategoryInput,
  UpdateEditionInput,
} from "./awards.validation.js";

export class AwardsServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AwardsServiceError";
    this.statusCode = statusCode;
  }
}

export const getEditions = (includeArchived: boolean) => listEditions(includeArchived);

export const getEdition = async (id: string) => {
  const edition = await getEditionById(id);
  if (!edition) throw new AwardsServiceError("Award edition not found", 404);
  return edition;
};

export const addEdition = (
  input: CreateEditionInput,
  actorUid: string,
  context: AuditRequestContext
) => createEdition(input, actorUid, context);

export const editEdition = async (
  id: string,
  changes: UpdateEditionInput,
  actorUid: string,
  context: AuditRequestContext
) => {
  const edition = await updateEdition(id, changes, actorUid, context);
  if (!edition) throw new AwardsServiceError("Award edition not found", 404);
  return edition;
};

export const changeEditionStatus = async (
  id: string,
  status: string,
  actorUid: string,
  context: AuditRequestContext
) => {
  const result = await transitionEditionStatus(id, status, actorUid, context);
  if (!result) throw new AwardsServiceError("Award edition not found", 404);
  return result;
};

export const getCategories = (editionId?: string) => listCategories(editionId);

export const addCategory = (
  input: CreateCategoryInput,
  actorUid: string,
  context: AuditRequestContext
) => createCategory(input, actorUid, context);

export const editCategory = async (
  id: string,
  changes: UpdateCategoryInput,
  actorUid: string,
  context: AuditRequestContext
) => {
  const category = await updateCategory(id, changes, actorUid, context);
  if (!category) throw new AwardsServiceError("Award category not found", 404);
  return category;
};

export const configureCategoryForEdition = (
  editionId: number,
  categoryId: number,
  input: EditionCategoryInput,
  actorUid: string,
  context: AuditRequestContext
) => configureEditionCategory(editionId, categoryId, input, actorUid, context);