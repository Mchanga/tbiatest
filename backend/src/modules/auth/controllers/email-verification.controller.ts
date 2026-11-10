import type { RequestHandler } from "express";

import { z } from "zod";

import {
  verifyEmailAddress,
  resendEmailVerification,
} from "../services/email-verification.service.js";

import {
  resendVerificationSchema,
} from "../auth.validation.js";

import asyncHandler from "../../../utils/asyncHandler.js";



const verifyEmailSchema = z.object({
  token: z.string().min(1).max(256),
}).strict();
const loginUrl = (): string =>
  new URL("/login", process.env.FRONTEND_URL || "http://localhost:5173").toString();
const loginLink = (): string =>
  `<a href="${loginUrl()}">Return to sign in</a>`;

export const verifyEmailPage: RequestHandler = (req, res) => {
  const token = req.query.token;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    res
      .status(400)
      .type("html")
      .send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invalid email link</title><h1>This link is not valid</h1><p>Request a new verification email from the sign-in page.</p>${loginLink()}</html>`);
    return;
  }

  res.type("html").send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify TBIA email</title></head>
<body>
  <main>
    <h1>Verify your email</h1>
    <p>Confirm this address to activate your TBIA account.</p>
    <form method="post" action="/api/v1/auth/verify-email">
      <input type="hidden" name="token" value="${token}">
      <button type="submit">Confirm email</button>
    </form>
  </main>
</body>
</html>`);
};



export const verifyEmail: RequestHandler = asyncHandler(
  async (req, res) => {
    const validation = verifyEmailSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Invalid verification token",
        errors: validation.error.flatten(),
      });
      return;
    }

    const user = await verifyEmailAddress(
      validation.data.token,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    if (!user) {
      if (req.is("application/x-www-form-urlencoded")) {
        res
          .status(400)
          .type("html")
          .send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email not verified</title><h1>This link has expired or was already used</h1><p>Go to sign in and request a new verification email.</p>${loginLink()}</html>`);
        return;
      }
      res.status(400).json({
        success: false,
        message: "Verification link is invalid, expired or already used",
      });
      return;
    }

    if (req.is("application/x-www-form-urlencoded")) {
      res
        .type("html")
        .send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email verified</title><h1>Email verified</h1><p>Your email address is confirmed. You can now sign in.</p>${loginLink()}</html>`);
      return;
    }

    res.status(200).json({
      success: true,
      message: user.accountActivated
        ? "Email verified successfully. Your account is now active."
        : "Email verified, but your account is not active.",
      data: {
        email: user.email,
        status: user.status,
        isVerified: user.isVerified,
      },
    });
  }
);



export const resendVerification: RequestHandler = asyncHandler(
  async (req, res) => {
    const validation = resendVerificationSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        message: "Invalid email address",
        errors: validation.error.flatten(),
      });
      return;
    }

    await resendEmailVerification(validation.data.email);
    res.status(200).json({
      success: true,
      message:
        "If the account is eligible, a verification email has been sent.",
    });
  }
);