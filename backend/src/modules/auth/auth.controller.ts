import type { RequestHandler } from "express";

import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.validation.js";

import {
  registerUser,
  loginUser,
} from "./auth.service.js";
import {
  requestPasswordReset,
  resetPassword,
} from "./services/password-reset.service.js";
import {
  refreshSession,
  revokeRefreshSession,
} from "./services/refresh-token.service.js";
import { REFRESH_TOKEN_TTL_MS } from "./services/token.service.js";

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/v1/auth",
};

import asyncHandler from "./../../utils/asyncHandler.js";



export const register: RequestHandler = asyncHandler(
  async (req, res) => {
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.flatten(),
      });
      return;
    }

    const result = await registerUser(validation.data, {
      requestId: req.requestId,
      ipAddress: req.ip ?? "127.0.0.1",
      userAgent: req.get("user-agent") ?? undefined,
    });

    res.status(201).json({
      success: true,
      ...result,
    });
  }
);



export const login: RequestHandler = asyncHandler(
  async (req, res) => {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.error.flatten(),
      });
      return;
    }

    const ipAddress = req.ip ?? "127.0.0.1";
    const userAgent = req.get("user-agent") ?? undefined;

    const result = await loginUser(
      validation.data,
      ipAddress,
      userAgent,
      req.requestId
    );

    const { refreshToken, ...loginResponse } = result;
    res.cookie("tbia_refresh_token", refreshToken, {
      ...refreshCookieOptions,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });

    res.status(200).json({
      success: true,
      data: loginResponse,
    });
  }
);



export const getMe: RequestHandler = asyncHandler(
  async (req, res) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Unauthenticated",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      data: {
        authenticated: true,
        roleId: req.user.roleId,
        roleIds: req.user.roleIds,
        accountType: req.user.accountType,
      },
    });
  }
);

export const forgotPassword: RequestHandler = asyncHandler(
  async (req, res) => {
    const validation = forgotPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Invalid email address",
        errors: validation.error.flatten(),
      });
      return;
    }

    await requestPasswordReset(validation.data.email);

    res.status(200).json({
      success: true,
      message: "If the account exists, password reset instructions have been sent.",
    });
  }
);

export const resetPasswordWithToken: RequestHandler = asyncHandler(
  async (req, res) => {
    const validation = resetPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Invalid password reset request",
        errors: validation.error.flatten(),
      });
      return;
    }

    const reset = await resetPassword(
      validation.data.token,
      validation.data.password,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    if (!reset) {
      res.status(400).json({
        success: false,
        message: "Password reset token is invalid or expired",
      });
      return;
    }

    if (req.is("application/x-www-form-urlencoded")) {
      res.type("html").send("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Password reset</title><h1>Password updated</h1><p>Your password has been changed. You can sign in now.</p></html>");
      return;
    }

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully",
    });
  }
);

export const resetPasswordPage: RequestHandler = (req, res) => {
  const token = req.query.token;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(400).type("text").send("Password reset link is invalid.");
    return;
  }

  res.type("html").send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reset TBIA password</title></head>
<body>
  <main>
    <h1>Reset your password</h1>
    <form method="post" action="/api/v1/auth/reset-password">
      <input type="hidden" name="token" value="${token}">
      <label>New password <input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="64" required></label>
      <label>Confirm password <input type="password" name="password_confirmation" autocomplete="new-password" minlength="8" maxlength="64" required></label>
      <button type="submit">Set new password</button>
    </form>
  </main>
</body>
</html>`);
};

export const refresh: RequestHandler = asyncHandler(
  async (req, res) => {
    const token = req.cookies?.tbia_refresh_token;

    if (typeof token !== "string") {
      res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
      return;
    }

    const result = await refreshSession(
      token,
      req.ip ?? "127.0.0.1",
      req.get("user-agent") ?? undefined,
      req.requestId
    );

    if (!result) {
      res.clearCookie("tbia_refresh_token", refreshCookieOptions);
      res.status(401).json({
        success: false,
        message: "Refresh token is invalid or expired",
      });
      return;
    }

    res.cookie("tbia_refresh_token", result.refreshToken, {
      ...refreshCookieOptions,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        tokenType: "Bearer",
        expiresIn: "15m",
      },
    });
  }
);

export const logout: RequestHandler = asyncHandler(
  async (req, res) => {
    const token = req.cookies?.tbia_refresh_token;

    if (typeof token === "string") {
      await revokeRefreshSession(token, {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    res.clearCookie("tbia_refresh_token", refreshCookieOptions);
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  }
);