export const publicApiUrl = (path: string): URL => {
  const configuredUrl = process.env.PUBLIC_API_URL;

  if (!configuredUrl && process.env.NODE_ENV === "production") {
    throw new Error("PUBLIC_API_URL must be configured in production");
  }

  const baseUrl = new URL(
    configuredUrl || `http://localhost:${process.env.PORT || 5000}`
  );

  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new Error("PUBLIC_API_URL must use HTTPS in production");
  }

  return new URL(path, baseUrl.origin);
};