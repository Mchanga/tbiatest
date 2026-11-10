import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { findUserByUid } from "../modules/auth/auth.repository.js";
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        roleId: number;
        roleIds: number[];
        accountType: string;
      };
    }
  }
}

const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      res.status(401).json({
        success: false,
        message: "Authentication token is required",
      });
      return;
    }
    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
      return;
    }

    const token = match[1];
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret || secret.length < 32) {
      throw new Error("JWT access secret is missing or invalid");
    }
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER || "tbia-api",
      audience: process.env.JWT_AUDIENCE || "tbia-client",
    });

    if (
      typeof decoded === "string" ||
      !(decoded as JwtPayload).sub
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

    const uid = (decoded as JwtPayload).sub as string;
    const user = await findUserByUid(uid);

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User account not found",
      });
      return;
    }
    if (!user.is_verified) {
      res.status(403).json({
        success: false,
        message: "Please verify your email address",
      });
      return;
    }
    if (user.status !== "active") {
      res.status(403).json({
        success: false,
        message: "Your account is not active",
      });
      return;
    }

    if (!user.account_type) {
      res.status(403).json({
        success: false,
        message: "User account type is missing",
      });
      return;
    }
    req.user = {
      uid: user.uid,
      roleId: user.role_id,
      roleIds: user.role_ids,
      accountType: user.account_type,
    };

    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError ||
        error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token",
      });
      return;
    }

    next(error);
  }
};

export default authenticate;