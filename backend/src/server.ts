import app from "./app.js";
import pool from "./config/database.js";
import { loadEnv } from "./config/env.js";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const { PORT, LOG_LEVEL } = loadEnv();
logger.level = LOG_LEVEL;

async function startServer(): Promise<void> {
  try {
    await pool.query("SELECT 1");

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, "TBIA backend started");
    });

    server.requestTimeout = 30_000;
    server.headersTimeout = 35_000;
    server.keepAliveTimeout = 5_000;

    let shuttingDown = false;
    const shutdown = (signal: string): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, "Graceful shutdown started");

      const forceExit = setTimeout(() => {
        logger.error("Graceful shutdown timed out");
        process.exit(1);
      }, 15_000);
      forceExit.unref();

      server.close((error) => {
        if (error) logger.error({ errorName: error.name }, "HTTP server close failed");
        void pool.end().then(() => {
          clearTimeout(forceExit);
          process.exitCode = error ? 1 : 0;
          logger.info("TBIA backend stopped");
        }).catch((poolError: unknown) => {
          clearTimeout(forceExit);
          logger.error({ errorName: poolError instanceof Error ? poolError.name : "UnknownError" }, "Database pool close failed");
          process.exitCode = 1;
        });
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

  } catch (error) {
    logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unable to start TBIA backend");

    await pool.end();
    process.exitCode = 1;
  }
}

void startServer();
