import type { ErrorRequestHandler } from "express";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: ["password", "token", "secret", "authorization", "cookie"],
});

const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  next
) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode =
    Number(error.statusCode || error.status) || 500;

  logger.error({
    requestId: req.requestId,
    statusCode,
    errorName: error instanceof Error ? error.name : "UnknownError",
  }, "Request failed");

  const message =
    process.env.NODE_ENV === "production"
      ? statusCode >= 500
        ? "Internal server error"
        : error.message
      : error.message || "Something went wrong";

  res.status(statusCode).json({
    success: false,
    message,
  });
};

export default errorHandler;
