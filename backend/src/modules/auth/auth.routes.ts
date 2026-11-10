import { Router } from "express";

import {
  register,
  login,
  forgotPassword,
  resetPasswordWithToken,
  resetPasswordPage,
  refresh,
  logout,
} from "./auth.controller.js";
import {
  loginLimiter,
  passwordResetLimiter,
  refreshLimiter,
  registerLimiter,
} from "../../middleware/authRateLimit.js";
import sameOrigin from "../../middleware/sameOrigin.js";

import {
  verifyEmail,
  verifyEmailPage,
  resendVerification,
} from "./controllers/email-verification.controller.js";

const router = Router();
router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);

router.post("/forgot-password", passwordResetLimiter, forgotPassword);

router.post("/reset-password", passwordResetLimiter, resetPasswordWithToken);

router.get("/reset-password", resetPasswordPage);

router.post("/refresh", refreshLimiter, sameOrigin, refresh);

router.post("/logout", sameOrigin, logout);
router.post("/verify-email", verifyEmail);
router.get("/verify-email", verifyEmailPage);
router.post("/resend-verification", passwordResetLimiter, resendVerification);

export default router;