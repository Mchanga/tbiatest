import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { findUserByEmail } from "../auth.repository.js";
import {
  consumePasswordReset,
  createPasswordReset,
} from "../repositories/password-reset.repository.js";
import { sendPasswordResetEmail } from "../../../services/email.service.js";
import { publicApiUrl } from "../../../config/publicApiUrl.js";
import type { AuditRequestContext } from "../../../services/audit.service.js";

const RESET_EXPIRY_MINUTES = 30;

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const requestPasswordReset = async (
  email: string
): Promise<void> => {
  const user = await findUserByEmail(email);

  if (!user) {
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000
  );

  await createPasswordReset(email, hashToken(token), expiresAt);

  const resetUrl = publicApiUrl("/api/v1/auth/reset-password");
  resetUrl.searchParams.set("token", token);

  try {
    await sendPasswordResetEmail({
      email: user.email,
      fullName: user.full_name,
      resetUrl: resetUrl.toString(),
    });
  } catch (error) {
    console.error("TBIA password reset email delivery failed:", error);
  }
};

export const resetPassword = async (
  token: string,
  password: string,
  auditContext: AuditRequestContext
): Promise<boolean> => {
  if (!token || token.length !== 64) {
    return false;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return consumePasswordReset(hashToken(token), passwordHash, auditContext);
};