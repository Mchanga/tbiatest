import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pool from "../../src/config/database.js";

const migrationsDirectory = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();

    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDirectory, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [file]
      );

      if (applied.rowCount) {
        if (applied.rows[0].checksum.trim() !== checksum) {
          throw new Error(`Applied migration ${file} has been modified`);
        }
        console.log(`Already applied: ${file}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [file, checksum]
        );
        await client.query("COMMIT");
        console.log(`Applied: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

void runMigrations().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});