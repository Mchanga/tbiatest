import pg from "pg";
import dotenv from "dotenv";
import pino from "pino";

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const pool = new pg.Pool({
	host: process.env.DB_HOST || "localhost",
	port: Number(process.env.DB_PORT || 5432),
	database: process.env.DB_NAME,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	max: Number(process.env.DB_POOL_MAX || 10),
	ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5_000,
});

pool.on("error", (error: Error) => {
	logger.error({ errorName: error.name }, "PostgreSQL pool error");
});

export default pool;
