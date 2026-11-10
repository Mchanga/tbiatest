import rateLimit from "express-rate-limit";

const createAuthLimiter = (limit: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  });

export const registerLimiter = createAuthLimiter(
  5,
  60 * 60 * 1000
);

export const loginLimiter = createAuthLimiter(
  10,
  15 * 60 * 1000
);

export const passwordResetLimiter = createAuthLimiter(
  3,
  15 * 60 * 1000
);

export const refreshLimiter = createAuthLimiter(
  30,
  15 * 60 * 1000
);