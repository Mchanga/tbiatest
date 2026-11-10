import bcrypt from "bcryptjs";

import {
  findUserByEmail,
  createUser,
  updateLastLogin,
  recordLoginAttempt,
} from "./auth.repository.js";

import type {
  RegisterInput,
  LoginInput,
} from "./auth.validation.js";

import type {
  UserRecord,
} from "./auth.repository.js";

import {
  issueEmailVerification,
} from "./services/email-verification.service.js";
import { createAccessToken } from "./services/token.service.js";
import { issueRefreshToken } from "./services/refresh-token.service.js";
import { writeAuditLog } from "../../services/audit.service.js";



export class AuthServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
  }
}



const publicUser = (user: UserRecord) => {
  const {
    password_hash,
    ...safeUser
  } = user;

  return safeUser;
};



export const registerUser = async (
  data: RegisterInput,
  auditContext: { requestId: string; ipAddress: string; userAgent?: string }
) => {
  const existingUser = await findUserByEmail(data.email);

  if (existingUser) {
    throw new AuthServiceError(
      "Email address is already registered",
      409
    );
  }
  const passwordHash = await bcrypt.hash(
    data.password,
    12
  );

  let user: UserRecord;

  try {
    user = await createUser({
      account_type: data.account_type,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      password_hash: passwordHash,
      accept_terms: data.accept_terms,
    }, auditContext);

  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "P2002" || error.code === "23505")
    ) {
      throw new AuthServiceError(
        "Email address is already registered",
        409
      );
    }

    throw error;
  }



  let verificationEmailSent = false;

  try {

    await issueEmailVerification({
      uid: user.uid,
      email: user.email,
      full_name: user.full_name,
    });

    verificationEmailSent = true;

  } catch (error) {

    console.error(
      "TBIA verification email delivery failed:",
      error
    );
  }

  return {
    message: verificationEmailSent
      ? "Registration successful. Please check your email to verify your account."
      : "Account created, but verification email could not be sent. Please request another verification email.",

    requiresEmailVerification: true,

    verificationEmailSent,

    user: publicUser(user),
  };
};



export const loginUser = async (
  data: LoginInput,
  ipAddress = "127.0.0.1",
  userAgent: string | undefined,
  requestId: string
) => {
  const user = await findUserByEmail(data.email);

  if (!user) {

    await recordLoginAttempt(
      data.email,
      ipAddress,
      false,
      userAgent
    );

    throw new AuthServiceError(
      "Invalid email or password",
      401
    );
  }
  const passwordMatches = await bcrypt.compare(
    data.password,
    user.password_hash
  );

  if (!passwordMatches) {

    await recordLoginAttempt(
      data.email,
      ipAddress,
      false,
      userAgent
    );

    throw new AuthServiceError(
      "Invalid email or password",
      401
    );
  }

  if (!user.account_type) {
    throw new AuthServiceError("Account type is missing", 403);
  }
  if (!user.is_verified) {

    await recordLoginAttempt(
      data.email,
      ipAddress,
      false,
      userAgent
    );

    throw new AuthServiceError(
      "Please verify your email before logging in",
      403
    );
  }
  if (user.status !== "active") {

    await recordLoginAttempt(
      data.email,
      ipAddress,
      false,
      userAgent
    );

    throw new AuthServiceError(
      "Your account is not active",
      403
    );
  }

  const accessToken = createAccessToken(user);

  await writeAuditLog({
    requestId,
    actorUid: user.uid,
    action: "auth.login",
    entityType: "users",
    newValues: { outcome: "success" },
    ipAddress,
    userAgent,
  });
  await updateLastLogin(
    user.uid,
    ipAddress
  );
  await recordLoginAttempt(
    data.email,
    ipAddress,
    true,
    userAgent
  );

  const refreshToken = await issueRefreshToken(
    user.uid,
    ipAddress,
    userAgent
  );

  return {
    message: "Login successful",

    accessToken,

    refreshToken,

    tokenType: "Bearer",

    expiresIn: "15m",

    user: publicUser(user),
  };
};