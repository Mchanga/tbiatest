import crypto from "node:crypto";
import type { AuditRequestContext } from "../../../services/audit.service.js";

import {
  createRefreshToken as storeRefreshToken,
  rotateRefreshToken as rotateStoredRefreshToken,
  revokeRefreshToken as revokeStoredRefreshToken,
} from "../repositories/refresh-token.repository.js";
import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "./token.service.js";

export const issueRefreshToken = async (
  uid: string,
  ipAddress: string,
  userAgent?: string
): Promise<string> => {
  const token = generateRefreshToken();
  await storeRefreshToken(
    uid,
    hashRefreshToken(token),
    crypto.randomUUID(),
    refreshTokenExpiry(),
    ipAddress,
    userAgent
  );
  return token;
};

export const refreshSession = async (
  token: string,
  ipAddress: string,
  userAgent: string | undefined,
  requestId: string
): Promise<{ accessToken: string; refreshToken: string } | null> => {
  const replacementToken = generateRefreshToken();
  const user = await rotateStoredRefreshToken(
    hashRefreshToken(token),
    hashRefreshToken(replacementToken),
    refreshTokenExpiry(),
    ipAddress,
    userAgent,
    { requestId, ipAddress, userAgent }
  );

  if (!user) {
    return null;
  }

  return {
    accessToken: createAccessToken(user),
    refreshToken: replacementToken,
  };
};

export const revokeRefreshSession = async (
  token: string,
  auditContext: AuditRequestContext
): Promise<void> => {
  await revokeStoredRefreshToken(hashRefreshToken(token), auditContext);
};