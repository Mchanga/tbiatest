export const allowedOrigins = (): string[] => {
  const configuredOrigins = [
    ...(process.env.CORS_ORIGIN ?? "").split(","),
    process.env.FRONTEND_URL ?? "",
  ]
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);

  return configuredOrigins.length > 0
    ? [...new Set(configuredOrigins)]
    : ["http://localhost:5173"];
};
