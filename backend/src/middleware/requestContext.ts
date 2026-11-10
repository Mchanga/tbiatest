import crypto from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      rawBody?: Buffer;
      file?: {
        fieldname: string;
        originalname: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
      };
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestContext: RequestHandler = (req, res, next) => {
  const suppliedId = req.get("x-request-id");
  req.requestId = suppliedId && UUID_PATTERN.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

export default requestContext;
