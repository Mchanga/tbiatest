import crypto from "node:crypto";
import jwt from "jsonwebtoken";

interface AccessTokenUser {
  uid: string;
  role_id: number;
  role_ids: number[];
  account_type: string | null;
}

const parseDurationMs = (value: string): number => {
  const match = /^([0-9]+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error("Token expiry must use a supported duration such as 15m or 30d");
  }

  const amount = Number(match[1]);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return amount * multiplier;
};

export const REFRESH_TOKEN_TTL_MS = parseDurationMs(
  process.env.JWT_REFRESH_EXPIRES_IN || "30d"
);

export const createAccessToken = (user: AccessTokenUser): string => {
  if (!user.account_type) {
    throw new Error("User account type is missing");
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  const issuer = process.env.JWT_ISSUER || "tbia-api";
  const audience = process.env.JWT_AUDIENCE || "tbia-client";
  const expiresIn = (process.env.JWT_ACCESS_EXPIRES_IN || "15m") as jwt.SignOptions["expiresIn"];

  if (!secret || secret.length < 32) {
    throw new Error("JWT access secret is missing or too short");
  }

  return jwt.sign(
    {
      roleId: user.role_id,
      roleIds: user.role_ids,
      accountType: user.account_type,
    },
    secret,
    {
      subject: user.uid,
      issuer,
      audience,
      expiresIn,
      algorithm: "HS256",
    }
  );
};

export const generateRefreshToken = (): string =>
  crypto.randomBytes(64).toString("base64url");

export const hashRefreshToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const refreshTokenExpiry = (): Date =>
  new Date(Date.now() + REFRESH_TOKEN_TTL_MS);