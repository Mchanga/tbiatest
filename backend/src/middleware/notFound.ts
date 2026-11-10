import type { RequestHandler } from "express";

const notFound: RequestHandler = (req, _res, next) => {
  const error = new Error(
    `Route not found: ${req.method} ${req.originalUrl}`
  ) as Error & { statusCode: number };

  error.statusCode = 404;

  next(error);
};

export default notFound;