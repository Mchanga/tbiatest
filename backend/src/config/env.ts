import "dotenv/config";
import { z } from "zod";

const durationPattern = /^\d+[smhd]$/;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL: z.enum(["true", "false"]).default("false"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().regex(durationPattern).default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().regex(durationPattern).default("30d"),
  JWT_ISSUER: z.string().min(1).default("tbia-api"),
  JWT_AUDIENCE: z.string().min(1).default("tbia-client"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export const loadEnv = () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  if (parsed.data.NODE_ENV === "production") {
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.data.DB_HOST.toLowerCase())) {
      throw new Error("DB_HOST must point to a database reachable from the production service");
    }
    if (!parsed.data.DB_PASSWORD || parsed.data.DB_PASSWORD.startsWith("replace-with-")) {
      throw new Error("A production DB_PASSWORD must be configured");
    }
    if (parsed.data.JWT_ACCESS_SECRET.startsWith("replace-with-")) {
      throw new Error("A production JWT_ACCESS_SECRET must be configured");
    }
    const origins = parsed.data.CORS_ORIGIN.split(",").map((origin) => origin.trim());
    if (origins.some((origin) => !origin.startsWith("https://"))) {
      throw new Error("All production CORS_ORIGIN values must use HTTPS");
    }
    if (!parsed.data.FRONTEND_URL.startsWith("https://")) {
      throw new Error("FRONTEND_URL must use HTTPS in production");
    }
    if (!parsed.data.PUBLIC_API_URL || !parsed.data.PUBLIC_API_URL.startsWith("https://")) {
      throw new Error("PUBLIC_API_URL must be an HTTPS URL in production");
    }

    if (
      !parsed.data.SMTP_HOST ||
      !parsed.data.SMTP_PORT ||
      !parsed.data.SMTP_USER ||
      !parsed.data.SMTP_PASSWORD ||
      !parsed.data.MAIL_FROM
    ) {
      throw new Error("Complete SMTP and MAIL_FROM configuration is required in production");
    }
  }

  return parsed.data;
};
