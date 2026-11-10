import {
  getUserProfile,
  listUsers,
  assignUserRoles as assignUserRolesRepository,
  softDeleteUser,
  updateManagedUser,
  updateOwnProfile,
  updateUserStatus,
} from "./users.repository.js";
import type {
  AssignUserRolesInput,
  ListUsersQuery,
  UpdateOwnProfileInput,
  UpdateUserInput,
} from "./users.validation.js";
import type { AuditRequestContext } from "../../services/audit.service.js";

export class UserManagementError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "UserManagementError";
    this.statusCode = statusCode;
  }
}

export const getProfile = async (uid: string) => {
  const profile = await getUserProfile(uid);
  if (!profile) throw new UserManagementError("User not found", 404);
  return profile;
};

export const updateProfile = async (
  uid: string,
  changes: UpdateOwnProfileInput,
  auditContext: AuditRequestContext,
) => {
  const profile = await updateOwnProfile(uid, changes, auditContext);
  if (!profile) throw new UserManagementError("User not found", 404);
  return profile;
};

export const updateManagedUserProfile = async (
  uid: string,
  changes: UpdateUserInput,
  actorUid: string,
  auditContext: AuditRequestContext,
) => {
  const profile = await updateManagedUser(uid, changes, actorUid, auditContext);
  if (!profile) throw new UserManagementError("User not found", 404);
  return profile;
};

export const searchUsers = (query: ListUsersQuery) => listUsers(query);

export const changeUserStatus = async (
  uid: string,
  status: string,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<void> => {
  const changed = await updateUserStatus(uid, status, actorUid, auditContext);
  if (!changed) throw new UserManagementError("User not found", 404);
};

export const deleteUserAccount = async (
  uid: string,
  actorUid: string,
  auditContext: AuditRequestContext,
): Promise<void> => {
  const deleted = await softDeleteUser(uid, actorUid, auditContext);
  if (!deleted) throw new UserManagementError("User not found", 404);
};

export const assignUserRoles = async (
  uid: string,
  input: AssignUserRolesInput,
  actorUid: string,
  actorRoleIds: number[],
  auditContext: AuditRequestContext,
): Promise<string[]> => {
  const roles = await assignUserRolesRepository(
    uid,
    input.roleSlugs,
    actorUid,
    actorRoleIds,
    auditContext,
  );
  if (!roles) throw new UserManagementError("User not found", 404);
  return roles;
};
