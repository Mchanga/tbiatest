import crypto from "node:crypto";

import {
  createEmailVerification,
  verifyEmailToken,
} from "../repositories/email-verification.repository.js";
import { findUserByEmail } from "../auth.repository.js";

import {
  sendVerificationEmail,
} from "../../../services/email.service.js";
import type { AuditRequestContext } from "../../../services/audit.service.js";
const VERIFICATION_EXPIRY_HOURS = 24;

interface VerificationUser {
  uid: string;
  email: string;
  full_name: string;
}
const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};
const hashVerificationToken = (token: string): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};
export const issueEmailVerification = async (
  user: VerificationUser
): Promise<void> => {
  const token = generateVerificationToken();
  const tokenHash = hashVerificationToken(token);

  const expiresAt = new Date(
    Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000
  );

  await createEmailVerification(
    user.uid,
    tokenHash,
    expiresAt
  );

  const verificationUrl = new URL(
    "/verify-email",
    process.env.FRONTEND_URL || "http://localhost:5173",
  );
  verificationUrl.searchParams.set("token", token);

  await sendVerificationEmail({
    email: user.email,
    fullName: user.full_name,
    verificationUrl: verificationUrl.toString(),
  });
};
export const verifyEmailAddress = async (
  token: string,
  auditContext: AuditRequestContext
) => {
  if (!token || token.length !== 64) {
    return null;
  }

  const tokenHash = hashVerificationToken(token);

  return await verifyEmailToken(tokenHash, auditContext);
};
export const hashReceivedVerificationToken = (
  token: string
): string => {
  return hashVerificationToken(token);
};



export const resendEmailVerification = async (
  email: string
): Promise<void> => {
  const user = await findUserByEmail(email);
  if (!user) {
    return;
  }
  if (user.is_verified) {
    return;
  }
  if (user.status !== "pending") {
    return;
  }
  await issueEmailVerification({
    uid: user.uid,
    email: user.email,
    full_name: user.full_name,
  });
};