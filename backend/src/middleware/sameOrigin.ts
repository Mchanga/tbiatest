import type { RequestHandler } from "express";
import { allowedOrigins } from "../config/allowedOrigins.js";

const sameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");

  if (!origin) {
    next();
    return;
  }

  if (origin === "null" || !allowedOrigins().includes(origin)) {
    res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
    return;
  }

  next();
};

export default sameOrigin;
