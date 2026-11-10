import type { RequestHandler } from "express";
import pool from "../config/database.js";

const authorize = (permissionSlug: string): RequestHandler => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }
      const permission = await pool.query<{ has_permission: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM role_permissions rp
          INNER JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = ANY($1::smallint[])
            AND p.slug = $2
        ) AS has_permission
        `,
        [req.user.roleIds, permissionSlug]
      );

      if (!permission.rows[0]?.has_permission) {
        res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action",
        });
        return;
      }

      next();

    } catch (error) {
      next(error);
    }
  };
};

export default authorize;