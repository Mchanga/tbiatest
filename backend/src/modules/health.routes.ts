import { Router } from "express";
import pool from "../config/database.js";

const router = Router();

router.get("/live", (_req, res) => {
  res.status(200).json({ success: true, status: "live" });
});

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "TBIA API is running",
  });
});

router.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ success: true, status: "ready" });
  } catch {
    res.status(503).json({ success: false, status: "not_ready" });
  }
});

router.get("/database", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "PostgreSQL connection is successful",
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "Database connection is unavailable",
    });
  }
});

export default router;
