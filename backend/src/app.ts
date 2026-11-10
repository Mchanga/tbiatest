import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import pino from "pino";
import { allowedOrigins } from "./config/allowedOrigins.js";

import routes from "./routes/index.js";

import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import requestContext from "./middleware/requestContext.js";

const app = express();

app.use(requestContext);

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password", "token", "secret"],
    censor: "[REDACTED]",
  },
});

app.use(pinoHttp({
  logger,
  genReqId: (req) => req.requestId,
  customProps: (req) => ({ requestId: req.requestId }),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url.split("?", 1)[0], id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins().includes(origin)) {
        callback(null, true);
      } else {
        callback(Object.assign(new Error("Request origin is not allowed"), { statusCode: 403 }));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb", verify: (req, _res, buffer) => {
  if ((req.url ?? "").startsWith("/api/v1/payments/webhooks/")) {
    (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  }
} }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  })
);
app.use("/api/v1", routes);
app.use(notFound);
app.use(errorHandler);

export default app;
