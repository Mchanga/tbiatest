import "dotenv/config";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PoolClient } from "pg";

import { writeAuditLog } from "../src/services/audit.service.js";

import cookieParser from "cookie-parser";

import express from "express";

import sameOrigin from "../src/middleware/sameOrigin.js";

import requestContext from "../src/middleware/requestContext.js";

import {
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resetPasswordPage,
  resetPasswordWithToken,
} from "../src/modules/auth/auth.controller.js";

import { verifyEmailPage } from "../src/modules/auth/controllers/email-verification.controller.js";

import {
  configureEditionCategory,
  createAwardCategory,
  createAwardEdition,
  listEditions,
  updateEditionStatus,
} from "../src/modules/awards/awards.controller.js";

import {
  create,
  getOne,
  listForReview,
  listMine,
  listPublic,
  updateMine,
  verify,
} from "../src/modules/businesses/businesses.controller.js";

import crypto from "node:crypto";

import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../src/services/email.service.js";

import { default as platformApp } from "../src/app.js";

import jwt from "jsonwebtoken";

import {
  createAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../src/modules/auth/services/token.service.js";

import {
  deleteUser,
  getMe,
  getUser,
  getUsers,
  setUserStatus,
  updateUser,
  updateMe,
} from "../src/modules/users/users.controller.js";

interface TestResponse {
  status: number;
  body: any;
  text: string;
  headers: Record<string, string | string[] | undefined>;
}

interface TestRequest extends Promise<TestResponse> {
  set(field: string, value: string): TestRequest;
  send(body: unknown): TestRequest;
}

interface TestAgent {
  get(path: string): TestRequest;
  post(path: string): TestRequest;
  put(path: string): TestRequest;
  patch(path: string): TestRequest;
  delete(path: string): TestRequest;
}

const request = createRequire(import.meta.url)("supertest") as (
  app: ReturnType<typeof express>,
) => TestAgent;

const auditMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: {
    connect: auditMocks.connect,
    query: auditMocks.poolQuery,
  },
}));

describe("audit service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM users")) {
        return { rows: [{ id: "42" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    auditMocks.connect.mockResolvedValue({
      query: auditMocks.query,
      release: auditMocks.release,
    } as unknown as PoolClient);
  });

  it("writes request and actor context while redacting sensitive values", async () => {
    await writeAuditLog({
      requestId: "d7df4e9e-b11e-46f8-bf86-77ea47450e10",
      actorUid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      action: "auth.login",
      entityType: "users",
      newValues: {
        outcome: "success",
        password_hash: "must-not-be-recorded",
        refresh_token: "must-not-be-recorded",
      },
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });

    const insert = auditMocks.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO audit_logs"),
    );
    expect(insert).toBeDefined();
    const values = insert![1] as unknown[];
    expect(values[0]).toBe("42");
    expect(values[1]).toBe("auth.login");
    expect(JSON.parse(values[5] as string)).toEqual({
      outcome: "success",
      password_hash: "[REDACTED]",
      refresh_token: "[REDACTED]",
    });
    expect(values[8]).toBe("d7df4e9e-b11e-46f8-bf86-77ea47450e10");
    expect(auditMocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the client when audit persistence fails", async () => {
    auditMocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id FROM users")) {
        return { rows: [{ id: "42" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error("audit insert failed");
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(
      writeAuditLog({
        requestId: "d7df4e9e-b11e-46f8-bf86-77ea47450e10",
        actorUid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
        action: "auth.login",
      }),
    ).rejects.toThrow("audit insert failed");

    expect(auditMocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(auditMocks.release).toHaveBeenCalledOnce();
  });
});

const authMocks = vi.hoisted(() => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  refreshSession: vi.fn(),
  revokeRefreshSession: vi.fn(),
}));

vi.mock("../src/modules/auth/auth.service.js", () => ({
  registerUser: authMocks.registerUser,
  loginUser: authMocks.loginUser,
}));

vi.mock("../src/modules/auth/services/password-reset.service.js", () => ({
  requestPasswordReset: authMocks.requestPasswordReset,
  resetPassword: authMocks.resetPassword,
}));

vi.mock("../src/modules/auth/services/refresh-token.service.js", () => ({
  refreshSession: authMocks.refreshSession,
  revokeRefreshSession: authMocks.revokeRefreshSession,
}));

const authControllerApp = express();
authControllerApp.use(express.json());
authControllerApp.use(express.urlencoded({ extended: true }));
authControllerApp.use(cookieParser());
authControllerApp.use(requestContext);
authControllerApp.post("/register", register);
authControllerApp.post("/login", login);
authControllerApp.post("/forgot-password", forgotPassword);
authControllerApp.post("/reset-password", resetPasswordWithToken);
authControllerApp.post("/refresh", sameOrigin, refresh);
authControllerApp.post("/logout", sameOrigin, logout);
authControllerApp.post("/origin-check", sameOrigin, (_req, res) =>
  res.sendStatus(204),
);
authControllerApp.get("/verify-email", verifyEmailPage);
authControllerApp.get("/reset-password", resetPasswordPage);
authControllerApp.get("/request-id", (req, res) =>
  res.json({ requestId: req.requestId }),
);

describe("auth controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_URL = "http://localhost:5173";
  });

  it("rejects registration unless terms are accepted", async () => {
    const response = await request(authControllerApp).post("/register").send({
      account_type: "business",
      full_name: "Test User",
      email: "test@example.invalid",
      password: "Smoke.Test.Password.2026!",
      password_confirmation: "Smoke.Test.Password.2026!",
      accept_terms: false,
    });

    expect(response.status).toBe(400);
    expect(authMocks.registerUser).not.toHaveBeenCalled();
  });

  it("sets and returns a UUID request correlation ID", async () => {
    const response = await request(authControllerApp)
      .get("/request-id")
      .set("X-Request-ID", "not-a-uuid");

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
  });

  it("registers valid data and returns the user result", async () => {
    authMocks.registerUser.mockResolvedValue({
      message: "Registration successful",
      verificationEmailSent: true,
      user: { uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93" },
    });

    const response = await request(authControllerApp).post("/register").send({
      account_type: "business",
      full_name: "Test User",
      email: "test@example.invalid",
      password: "Smoke.Test.Password.2026!",
      password_confirmation: "Smoke.Test.Password.2026!",
      accept_terms: true,
    });

    expect(response.status).toBe(201);
    expect(response.body.user.uid).toBe("3d3cc3b3-8db5-47bf-9081-28c49a0bdc93");
    expect(authMocks.registerUser).toHaveBeenCalledOnce();
  });

  it("returns the access token but sets refresh token only as HttpOnly cookie", async () => {
    authMocks.loginUser.mockResolvedValue({
      message: "Login successful",
      accessToken: "access-token",
      refreshToken: "raw-refresh-token",
      tokenType: "Bearer",
      expiresIn: "15m",
      user: { uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93" },
    });

    const response = await request(authControllerApp)
      .post("/login")
      .send({ email: "test@example.invalid", password: "valid-password" });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBe("access-token");
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("HttpOnly")]),
    );
  });

  it("allows the configured frontend origin when a separate CORS origin is set", async () => {
    const previousCorsOrigin = process.env.CORS_ORIGIN;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.CORS_ORIGIN = "https://api.tbia.example";
    process.env.FRONTEND_URL = "https://tbia.example/app/";

    try {
      const response = await request(authControllerApp)
        .post("/origin-check")
        .set("Origin", "https://tbia.example");

      expect(response.status).toBe(204);
    } finally {
      if (previousCorsOrigin === undefined) {
        delete process.env.CORS_ORIGIN;
      } else {
        process.env.CORS_ORIGIN = previousCorsOrigin;
      }

      if (previousFrontendUrl === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = previousFrontendUrl;
      }
    }
  });

  it("rotates refresh cookies and returns a new access token", async () => {
    authMocks.refreshSession.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });

    const response = await request(authControllerApp)
      .post("/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", "tbia_refresh_token=old-refresh-token");

    expect(response.status).toBe(200);
    expect(authMocks.refreshSession).toHaveBeenCalledWith(
      "old-refresh-token",
      "127.0.0.1",
      undefined,
      expect.any(String),
    );
    expect(response.body.data.accessToken).toBe("new-access-token");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("new-refresh-token")]),
    );
  });

  it("keeps forgot-password response generic", async () => {
    authMocks.requestPasswordReset.mockResolvedValue(undefined);

    const response = await request(authControllerApp)
      .post("/forgot-password")
      .send({ email: "test@example.invalid" });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("If the account exists");
  });

  it("revokes the refresh session on logout", async () => {
    const response = await request(authControllerApp)
      .post("/logout")
      .set("Cookie", "tbia_refresh_token=old-refresh-token");

    expect(response.status).toBe(200);
    expect(authMocks.revokeRefreshSession).toHaveBeenCalledWith(
      "old-refresh-token",
      expect.objectContaining({
        requestId: expect.any(String),
        ipAddress: "127.0.0.1",
      }),
    );
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Expires=Thu, 01 Jan 1970"),
      ]),
    );
  });

  it("rejects cross-origin requests that carry refresh cookies", async () => {
    const response = await request(authControllerApp)
      .post("/refresh")
      .set("Origin", "https://attacker.example")
      .set("Cookie", "tbia_refresh_token=old-refresh-token");

    expect(response.status).toBe(403);
    expect(authMocks.refreshSession).not.toHaveBeenCalled();
  });

  it("rejects invalid reset tokens", async () => {
    authMocks.resetPassword.mockResolvedValue(false);

    const response = await request(authControllerApp)
      .post("/reset-password")
      .send({
        token: "a".repeat(64),
        password: "Smoke.Reset.Password.2026!",
        password_confirmation: "Smoke.Reset.Password.2026!",
      });

    expect(response.status).toBe(400);
  });

  it("shows a confirmation page without consuming verification tokens on GET", async () => {
    const token = "a".repeat(64);
    const response = await request(authControllerApp).get(
      `/verify-email?token=${token}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.text).toContain('method="post"');
    expect(response.text).toContain("/api/v1/auth/verify-email");
  });

  it("shows a reset form for valid links and rejects malformed tokens", async () => {
    const token = "b".repeat(64);
    const valid = await request(authControllerApp).get(
      `/reset-password?token=${token}`,
    );
    const invalid = await request(authControllerApp).get(
      "/reset-password?token=bad",
    );

    expect(valid.status).toBe(200);
    expect(valid.text).toContain('name="password"');
    expect(valid.text).toContain("/api/v1/auth/reset-password");
    expect(invalid.status).toBe(400);
  });
});

const awardsMocks = vi.hoisted(() => ({
  addEdition: vi.fn(),
  getEdition: vi.fn(),
  getEditions: vi.fn(),
  editEdition: vi.fn(),
  changeEditionStatus: vi.fn(),
  addCategory: vi.fn(),
  editCategory: vi.fn(),
  getCategories: vi.fn(),
  configureCategoryForEdition: vi.fn(),
}));

vi.mock("../src/modules/awards/awards.service.js", () => awardsMocks);

const awardsControllerApp = express();
awardsControllerApp.use(express.json());
awardsControllerApp.use((req, _res, next) => {
  req.requestId = "d7df4e9e-b11e-46f8-bf86-77ea47450e10";
  req.user = {
    uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    roleId: 1,
    roleIds: [1],
    accountType: "individual",
  };
  next();
});
awardsControllerApp.get("/editions", listEditions);
awardsControllerApp.post("/editions", createAwardEdition);
awardsControllerApp.patch("/editions/:id/status", updateEditionStatus);
awardsControllerApp.post("/categories", createAwardCategory);
awardsControllerApp.put(
  "/editions/:editionId/categories/:categoryId",
  configureEditionCategory,
);

describe("awards controller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists editions", async () => {
    awardsMocks.getEditions.mockResolvedValue([{ id: 1, year: 2026 }]);

    const response = await request(awardsControllerApp).get("/editions");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("validates edition dates and creates a draft edition", async () => {
    awardsMocks.addEdition.mockResolvedValue({
      id: 2,
      year: 2027,
      status: "draft",
    });
    const valid = await request(awardsControllerApp).post("/editions").send({
      year: 2027,
      name: "TBIA 2027",
      nominations_open_at: "2027-01-01T00:00:00Z",
      nominations_close_at: "2027-03-01T00:00:00Z",
    });
    const invalid = await request(awardsControllerApp).post("/editions").send({
      year: 2027,
      name: "TBIA 2027",
      nominations_open_at: "2027-03-01T00:00:00Z",
      nominations_close_at: "2027-01-01T00:00:00Z",
    });

    expect(valid.status).toBe(201);
    expect(valid.body.data.status).toBe("draft");
    expect(invalid.status).toBe(400);
    expect(awardsMocks.addEdition).toHaveBeenCalledOnce();
  });

  it("rejects illegal edition status input", async () => {
    const response = await request(awardsControllerApp)
      .patch("/editions/1/status")
      .send({ status: "published" });

    expect(response.status).toBe(400);
    expect(awardsMocks.changeEditionStatus).not.toHaveBeenCalled();
  });

  it("requires weights to total 100 percent", async () => {
    const response = await request(awardsControllerApp)
      .put("/editions/1/categories/2")
      .send({
        selection_method: "hybrid",
        jury_weight_percent: 60,
        vote_weight_percent: 30,
      });

    expect(response.status).toBe(400);
    expect(awardsMocks.configureCategoryForEdition).not.toHaveBeenCalled();
  });

  it("accepts category input with a valid group", async () => {
    awardsMocks.addCategory.mockResolvedValue({ id: 4, name: "Innovation" });
    const response = await request(awardsControllerApp)
      .post("/categories")
      .send({
        group_id: 1,
        name: "Innovation",
        slug: "innovation",
        nominee_type: "business",
        sort_order: 1,
      });

    expect(response.status).toBe(201);
    expect(awardsMocks.addCategory).toHaveBeenCalledOnce();
  });
});

const businessMocks = vi.hoisted(() => ({
  createBusiness: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessesForReview: vi.fn(),
  getMyBusinesses: vi.fn(),
  getPublicBusinesses: vi.fn(),
  reviewBusiness: vi.fn(),
  updateBusiness: vi.fn(),
}));

vi.mock("../src/modules/businesses/businesses.service.js", () => businessMocks);

const businessesControllerApp = express();
businessesControllerApp.use(express.json());
businessesControllerApp.use((req, _res, next) => {
  req.requestId = "d7df4e9e-b11e-46f8-bf86-77ea47450e10";
  req.user = {
    uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    roleId: 9,
    roleIds: [9],
    accountType: "business",
  };
  next();
});
businessesControllerApp.post("/", create);
businessesControllerApp.get("/mine", listMine);
businessesControllerApp.get("/", listPublic);
businessesControllerApp.get("/review", listForReview);
businessesControllerApp.get("/:id", getOne);
businessesControllerApp.patch("/:id", updateMine);
businessesControllerApp.patch("/:id/verification", verify);

describe("businesses controller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a valid business as a business account", async () => {
    businessMocks.createBusiness.mockResolvedValue({
      id: "10",
      organisation_name: "TBIA Test Business",
      verification_status: "pending",
    });
    const response = await request(businessesControllerApp).post("/").send({
      organisation_name: "TBIA Test Business",
      registration_number: "REG-TEST-1",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.verification_status).toBe("pending");
    expect(businessMocks.createBusiness).toHaveBeenCalledWith(
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      "business",
      expect.objectContaining({ organisation_name: "TBIA Test Business" }),
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("rejects invalid business input before service invocation", async () => {
    const response = await request(businessesControllerApp)
      .post("/")
      .send({ registration_number: "REG" });

    expect(response.status).toBe(400);
    expect(businessMocks.createBusiness).not.toHaveBeenCalled();
  });

  it("returns only service-approved public businesses with pagination", async () => {
    businessMocks.getPublicBusinesses.mockResolvedValue({
      data: [{ id: "10", verification_status: "approved" }],
      total: 1,
    });
    const response = await request(businessesControllerApp).get(
      "/?page=2&limit=5&region=Arusha",
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 1,
      pages: 1,
    });
    expect(businessMocks.getPublicBusinesses).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      region: "Arusha",
    });
  });

  it("uses owner scope for mine and update routes", async () => {
    businessMocks.getMyBusinesses.mockResolvedValue([]);
    businessMocks.updateBusiness.mockResolvedValue({
      id: "10",
      organisation_name: "Updated",
    });
    const mine = await request(businessesControllerApp).get("/mine");
    const update = await request(businessesControllerApp)
      .patch("/10")
      .send({ organisation_name: "Updated" });

    expect(mine.status).toBe(200);
    expect(businessMocks.getMyBusinesses).toHaveBeenCalledWith(
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    );
    expect(update.status).toBe(200);
    expect(businessMocks.updateBusiness).toHaveBeenCalledWith(
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      "10",
      { organisation_name: "Updated" },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it("validates IDs and verification status before calling services", async () => {
    const invalidId = await request(businessesControllerApp).get("/not-an-id");
    const invalidStatus = await request(businessesControllerApp)
      .patch("/10/verification")
      .send({ verification_status: "magic" });

    expect(invalidId.status).toBe(400);
    expect(invalidStatus.status).toBe(400);
    expect(businessMocks.getBusiness).not.toHaveBeenCalled();
    expect(businessMocks.reviewBusiness).not.toHaveBeenCalled();
  });

  it("routes review requests with actor context", async () => {
    businessMocks.getBusinessesForReview.mockResolvedValue({
      data: [],
      total: 0,
    });
    businessMocks.reviewBusiness.mockResolvedValue(undefined);
    const list = await request(businessesControllerApp).get("/review");
    const review = await request(businessesControllerApp)
      .patch("/10/verification")
      .send({ verification_status: "approved" });

    expect(list.status).toBe(200);
    expect(review.status).toBe(200);
    expect(businessMocks.reviewBusiness).toHaveBeenCalledWith(
      "10",
      "approved",
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });
});

const emailLinkMocks = vi.hoisted(() => ({
  createEmailVerification: vi.fn(),
  verifyEmailToken: vi.fn(),
  findUserByEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  createPasswordReset: vi.fn(),
  consumePasswordReset: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock(
  "../src/modules/auth/repositories/email-verification.repository.js",
  () => ({
    createEmailVerification: emailLinkMocks.createEmailVerification,
    verifyEmailToken: emailLinkMocks.verifyEmailToken,
  }),
);

vi.mock("../src/modules/auth/auth.repository.js", () => ({
  findUserByEmail: emailLinkMocks.findUserByEmail,
}));

vi.mock(
  "../src/modules/auth/repositories/password-reset.repository.js",
  () => ({
    createPasswordReset: emailLinkMocks.createPasswordReset,
    consumePasswordReset: emailLinkMocks.consumePasswordReset,
  }),
);

describe("auth email links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("../src/services/email.service.js", () => ({
      sendVerificationEmail: emailLinkMocks.sendVerificationEmail,
      sendPasswordResetEmail: emailLinkMocks.sendPasswordResetEmail,
    }));
    process.env.FRONTEND_URL = "https://tbia.test";
    process.env.PUBLIC_API_URL = "https://api.tbia.test";
    emailLinkMocks.findUserByEmail.mockResolvedValue({
      uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      email: "member@example.invalid",
      full_name: "Test Member",
      is_verified: false,
      status: "pending",
    });
    emailLinkMocks.sendVerificationEmail.mockResolvedValue(undefined);
    emailLinkMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.doUnmock("../src/services/email.service.js");
    vi.resetModules();
  });

  it("emails a frontend verification page and stores only the token hash", async () => {
    const { issueEmailVerification } =
      await import("../src/modules/auth/services/email-verification.service.js");
    await issueEmailVerification({
      uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      email: "member@example.invalid",
      full_name: "Test Member",
    });

    const sent = emailLinkMocks.sendVerificationEmail.mock.calls[0][0];
    const verificationUrl = new URL(sent.verificationUrl);
    const token = verificationUrl.searchParams.get("token")!;

    expect(verificationUrl.origin).toBe("https://tbia.test");
    expect(verificationUrl.pathname).toBe("/verify-email");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(emailLinkMocks.createEmailVerification.mock.calls[0][1]).toBe(
      crypto.createHash("sha256").update(token).digest("hex"),
    );
  });

  it("emails the backend reset form and stores only the reset token hash", async () => {
    const { requestPasswordReset } = await vi.importActual<
      typeof import("../src/modules/auth/services/password-reset.service.js")
    >("../src/modules/auth/services/password-reset.service.js");
    await requestPasswordReset("member@example.invalid");

    const sent = emailLinkMocks.sendPasswordResetEmail.mock.calls[0][0];
    const resetUrl = new URL(sent.resetUrl);
    const token = resetUrl.searchParams.get("token")!;

    expect(resetUrl.origin).toBe("https://api.tbia.test");
    expect(resetUrl.pathname).toBe("/api/v1/auth/reset-password");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(emailLinkMocks.createPasswordReset.mock.calls[0][1]).toBe(
      crypto.createHash("sha256").update(token).digest("hex"),
    );
  });

  it("does not send a reset email for an unknown account", async () => {
    emailLinkMocks.findUserByEmail.mockResolvedValue(null);
    const { requestPasswordReset } = await vi.importActual<
      typeof import("../src/modules/auth/services/password-reset.service.js")
    >("../src/modules/auth/services/password-reset.service.js");

    await requestPasswordReset("unknown@example.invalid");

    expect(emailLinkMocks.createPasswordReset).not.toHaveBeenCalled();
    expect(emailLinkMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("hashes submitted reset tokens before consuming them", async () => {
    const token = "c".repeat(64);
    emailLinkMocks.consumePasswordReset.mockResolvedValue(true);
    const { resetPassword } = await vi.importActual<
      typeof import("../src/modules/auth/services/password-reset.service.js")
    >("../src/modules/auth/services/password-reset.service.js");

    await expect(
      resetPassword(token, "New.Password.2026!", {
        requestId: "d7df4e9e-b11e-46f8-bf86-77ea47450e10",
      }),
    ).resolves.toBe(true);

    const [tokenHash, passwordHash] =
      emailLinkMocks.consumePasswordReset.mock.calls[0];
    expect(tokenHash).toBe(
      crypto.createHash("sha256").update(token).digest("hex"),
    );
    expect(tokenHash).not.toBe(token);
    expect(passwordHash).not.toBe("New.Password.2026!");
  });
});

const emailMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: emailMocks.createTransport },
}));

describe("email service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.test.invalid";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "tbia@example.invalid";
    process.env.SMTP_PASSWORD = "test-password";
    process.env.MAIL_FROM = "TBIA <tbia@example.invalid>";
    emailMocks.createTransport.mockReturnValue({
      sendMail: emailMocks.sendMail,
      close: emailMocks.close,
    });
    emailMocks.sendMail.mockResolvedValue({ messageId: "test-message" });
    emailMocks.close.mockResolvedValue(undefined);
  });

  it("sends verification email with an escaped name and link", async () => {
    await sendVerificationEmail({
      email: "member@example.invalid",
      fullName: "<member>",
      verificationUrl: "https://api.example.invalid/verify?token=abc",
    });

    expect(emailMocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false, requireTLS: true }),
    );
    expect(emailMocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.invalid",
        text: expect.stringContaining(
          "https://api.example.invalid/verify?token=abc",
        ),
        html: expect.stringContaining("&lt;member&gt;"),
      }),
    );
  });

  it("sends password reset email to the requested address", async () => {
    await sendPasswordResetEmail({
      email: "member@example.invalid",
      fullName: "Member",
      resetUrl: "https://api.example.invalid/reset?token=abc",
    });

    expect(emailMocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.invalid",
        subject: expect.stringContaining("Reset"),
        text: expect.stringContaining(
          "https://api.example.invalid/reset?token=abc",
        ),
      }),
    );
  });

  it("fails closed when SMTP credentials are missing", async () => {
    process.env.SMTP_PASSWORD = "";

    await expect(
      sendVerificationEmail({
        email: "member@example.invalid",
        fullName: "Member",
        verificationUrl: "https://api.example.invalid/verify?token=abc",
      }),
    ).rejects.toThrow("Email SMTP configuration is incomplete");
    expect(emailMocks.sendMail).not.toHaveBeenCalled();
  });
});

describe("new platform API boundaries", () => {
  it("requires an authenticated verified account before voting", async () => {
    const response = await request(platformApp)
      .post("/api/v1/voting/vote")
      .send({ voting_period_id: 1, nomination_id: "1" });
    expect(response.status).toBe(401);
  });

  it("requires authentication for private documents and notifications", async () => {
    const document = await request(platformApp).get(
      "/api/v1/documents/1/download",
    );
    const notifications = await request(platformApp).get(
      "/api/v1/notifications",
    );
    expect(document.status).toBe(401);
    expect(notifications.status).toBe(401);
  });

  it("protects homepage media, sponsorship management, and category management", async () => {
    const responses = await Promise.all([
      request(platformApp).post("/api/v1/cms/media"),
      request(platformApp).get("/api/v1/sponsorship/management/packages"),
      request(platformApp).get("/api/v1/sponsorship/management/sponsors"),
      request(platformApp).get("/api/v1/awards/category-groups"),
      request(platformApp).delete("/api/v1/awards/categories/1"),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
  });

  it("rejects invalid localized CMS requests before database access", async () => {
    const response = await request(platformApp).get(
      "/api/v1/cms/public/about?lang=fr",
    );
    expect(response.status).toBe(400);
  });

  it("refuses payment webhooks without a valid time-bound signature", async () => {
    const response = await request(platformApp)
      .post("/api/v1/payments/webhooks/mpesa")
      .send({});
    expect(response.status).toBe(401);
  });

  it("validates event and certificate identifiers before database access", async () => {
    const order = await request(platformApp)
      .post("/api/v1/events/not-a-number/orders")
      .send({});
    const certificate = await request(platformApp).get(
      "/api/v1/winners/certificates/verify/invalid",
    );
    expect(order.status).toBe(400);
    expect(certificate.status).toBe(400);
  });

  it("requires judge authorization before showing assignments", async () => {
    const response = await request(platformApp).get(
      "/api/v1/judging/assignments/mine",
    );
    expect(response.status).toBe(401);
  });

  it("protects search endpoints that expose users, judges, and nominations", async () => {
    const responses = await Promise.all([
      request(platformApp).get("/api/v1/nominations/nominee-users?search=ab"),
      request(platformApp).get("/api/v1/judging/user-search?search=ab"),
      request(platformApp).get("/api/v1/judging/judges/search?search=ab"),
      request(platformApp).get(
        "/api/v1/judging/eligible-nominations?search=ab",
      ),
      request(platformApp).get(
        "/api/v1/winners/eligible-nominations?search=ab",
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401,
    ]);
  });
});

const refreshMocks = vi.hoisted(() => ({
  createRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

vi.mock("../src/modules/auth/repositories/refresh-token.repository.js", () => ({
  createRefreshToken: refreshMocks.createRefreshToken,
  rotateRefreshToken: refreshMocks.rotateRefreshToken,
  revokeRefreshToken: refreshMocks.revokeRefreshToken,
}));

describe("refresh-token service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = "unit-test-jwt-secret-long-enough-32-chars";
  });

  it("persists only a hash of the issued refresh token", async () => {
    const { issueRefreshToken } = await vi.importActual<
      typeof import("../src/modules/auth/services/refresh-token.service.js")
    >("../src/modules/auth/services/refresh-token.service.js");
    const token = await issueRefreshToken(
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      "127.0.0.1",
      "vitest",
    );

    expect(refreshMocks.createRefreshToken).toHaveBeenCalledOnce();
    expect(refreshMocks.createRefreshToken.mock.calls[0][0]).toBe(
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    );
    expect(refreshMocks.createRefreshToken.mock.calls[0][1]).toBe(
      hashRefreshToken(token),
    );
    expect(refreshMocks.createRefreshToken.mock.calls[0][1]).not.toBe(token);
  });

  it("rotates a valid token and returns a new access/refresh pair", async () => {
    const { refreshSession } = await vi.importActual<
      typeof import("../src/modules/auth/services/refresh-token.service.js")
    >("../src/modules/auth/services/refresh-token.service.js");
    const currentToken = "current-refresh-token";
    refreshMocks.rotateRefreshToken.mockResolvedValue({
      uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      role_id: 9,
      account_type: "business",
    });

    const result = await refreshSession(
      currentToken,
      "127.0.0.1",
      undefined,
      "d7df4e9e-b11e-46f8-bf86-77ea47450e10",
    );

    expect(refreshMocks.rotateRefreshToken.mock.calls[0][0]).toBe(
      hashRefreshToken(currentToken),
    );
    expect(result?.refreshToken).toBeTruthy();
    expect(result?.refreshToken).not.toBe(currentToken);
    expect(result?.accessToken).toBeTruthy();
    expect(refreshMocks.rotateRefreshToken.mock.calls[0][1]).toBe(
      hashRefreshToken(result!.refreshToken),
    );
  });

  it("rejects replayed or invalid refresh tokens", async () => {
    const { refreshSession } = await vi.importActual<
      typeof import("../src/modules/auth/services/refresh-token.service.js")
    >("../src/modules/auth/services/refresh-token.service.js");
    refreshMocks.rotateRefreshToken.mockResolvedValue(null);

    await expect(
      refreshSession(
        "replayed-token",
        "127.0.0.1",
        undefined,
        "d7df4e9e-b11e-46f8-bf86-77ea47450e10",
      ),
    ).resolves.toBeNull();
  });

  it("revokes by token hash instead of raw token", async () => {
    const { revokeRefreshSession } = await vi.importActual<
      typeof import("../src/modules/auth/services/refresh-token.service.js")
    >("../src/modules/auth/services/refresh-token.service.js");
    const token = "refresh-token-to-revoke";

    await revokeRefreshSession(token, {
      requestId: "d7df4e9e-b11e-46f8-bf86-77ea47450e10",
    });

    expect(refreshMocks.revokeRefreshToken).toHaveBeenCalledWith(
      hashRefreshToken(token),
      { requestId: "d7df4e9e-b11e-46f8-bf86-77ea47450e10" },
    );
  });
});

describe("token service", () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = "unit-test-jwt-secret-long-enough-32-chars";
  });

  it("creates a short-lived access token with the uid as subject", () => {
    const token = createAccessToken({
      uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      role_id: 9,
      role_ids: [9, 3],
      account_type: "business",
    });
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!,
    ) as jwt.JwtPayload;

    expect(decoded.sub).toBe("3d3cc3b3-8db5-47bf-9081-28c49a0bdc93");
    expect(decoded.iss).toBe("tbia-api");
    expect(decoded.aud).toBe("tbia-client");
    expect(decoded.roleId).toBe(9);
    expect(decoded.roleIds).toEqual([9, 3]);
    expect(decoded.exp! - decoded.iat!).toBe(15 * 60);
  });

  it("generates opaque refresh tokens and stores only a SHA-256 hash", () => {
    const token = generateRefreshToken();
    const tokenHash = hashRefreshToken(token);

    expect(token).not.toBe(tokenHash);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generateRefreshToken()).not.toBe(token);
  });

  it("sets refresh-token expiry to 30 days", () => {
    const before = Date.now();
    const expiry = refreshTokenExpiry().getTime();

    expect(expiry).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 30 * 24 * 60 * 60 * 1000);
  });
});

const usersMocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateManagedUserProfile: vi.fn(),
  updateProfile: vi.fn(),
  searchUsers: vi.fn(),
  changeUserStatus: vi.fn(),
  deleteUserAccount: vi.fn(),
}));

vi.mock("../src/modules/users/users.service.js", () => usersMocks);

const usersControllerApp = express();
usersControllerApp.use(express.json());
usersControllerApp.use((req, _res, next) => {
  req.requestId = "d7df4e9e-b11e-46f8-bf86-77ea47450e10";
  req.user = {
    uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    roleId: 9,
    roleIds: [9],
    accountType: "business",
  };
  next();
});
usersControllerApp.get("/me", getMe);
usersControllerApp.patch("/me", updateMe);
usersControllerApp.get("/", getUsers);
usersControllerApp.get("/:uid", getUser);
usersControllerApp.patch("/:uid", updateUser);
usersControllerApp.patch("/:uid/status", setUserStatus);
usersControllerApp.delete("/:uid", deleteUser);

describe("users controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMocks.poolQuery.mockResolvedValue({ rows: [] });
  });

  it("returns the authenticated user's profile", async () => {
    usersMocks.getProfile.mockResolvedValue({
      uid: "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    });

    const response = await request(usersControllerApp).get("/me");

    expect(response.status).toBe(200);
    expect(response.body.data.uid).toBe("3d3cc3b3-8db5-47bf-9081-28c49a0bdc93");
  });

  it("validates and forwards self-profile updates with request context", async () => {
    usersMocks.updateProfile.mockResolvedValue({ region: "Dar es Salaam" });

    const response = await request(usersControllerApp)
      .patch("/me")
      .send({ region: "Dar es Salaam" });

    expect(response.status).toBe(200);
    expect(usersMocks.updateProfile).toHaveBeenCalledWith(
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      { region: "Dar es Salaam" },
      expect.objectContaining({ requestId: expect.any(String) }),
    );

    const invalid = await request(usersControllerApp)
      .patch("/me")
      .send({ unknown: true });
    expect(invalid.status).toBe(400);
  });

  it("returns paginated search results", async () => {
    usersMocks.searchUsers.mockResolvedValue({
      data: [{ uid: "test" }],
      total: 1,
    });

    const response = await request(usersControllerApp).get(
      "/?page=2&limit=5&status=active",
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 1,
      pages: 1,
    });
    expect(usersMocks.searchUsers).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      status: "active",
    });
  });

  it("rejects malformed UIDs before querying a user", async () => {
    const response = await request(usersControllerApp).get("/not-a-uuid");

    expect(response.status).toBe(400);
    expect(usersMocks.getProfile).not.toHaveBeenCalled();
  });

  it("validates status changes before calling the service", async () => {
    const invalid = await request(usersControllerApp)
      .patch("/3d3cc3b3-8db5-47bf-9081-28c49a0bdc93/status")
      .send({ status: "unknown" });

    expect(invalid.status).toBe(400);
    expect(usersMocks.changeUserStatus).not.toHaveBeenCalled();
  });

  it("validates and forwards managed user profile updates", async () => {
    usersMocks.updateManagedUserProfile.mockResolvedValue({
      full_name: "Updated User",
    });
    const uid = "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93";

    const response = await request(usersControllerApp)
      .patch(`/${uid}`)
      .send({ full_name: "Updated User", phone: null });

    expect(response.status).toBe(200);
    expect(usersMocks.updateManagedUserProfile).toHaveBeenCalledWith(
      uid,
      { full_name: "Updated User", phone: null },
      "3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
      expect.objectContaining({ requestId: expect.any(String) }),
    );

    const invalid = await request(usersControllerApp)
      .patch(`/${uid}`)
      .send({ unknown: true });
    expect(invalid.status).toBe(400);
  });

  it("soft-deletes via the service and returns no content", async () => {
    usersMocks.deleteUserAccount.mockResolvedValue(undefined);

    const response = await request(usersControllerApp).delete(
      "/3d3cc3b3-8db5-47bf-9081-28c49a0bdc93",
    );

    expect(response.status).toBe(204);
    expect(usersMocks.deleteUserAccount).toHaveBeenCalledOnce();
  });
});

const resetIntegrationModules = async (): Promise<void> => {
  for (const moduleId of [
    "../src/config/database.js",
    "../src/modules/auth/auth.service.js",
    "../src/modules/auth/services/password-reset.service.js",
    "../src/modules/auth/services/refresh-token.service.js",
    "../src/modules/awards/awards.service.js",
    "../src/modules/businesses/businesses.service.js",
    "../src/modules/auth/repositories/email-verification.repository.js",
    "../src/modules/auth/auth.repository.js",
    "../src/services/email.service.js",
    "../src/modules/auth/repositories/password-reset.repository.js",
    "nodemailer",
    "../src/modules/auth/repositories/refresh-token.repository.js",
    "../src/modules/users/users.service.js",
  ])
    vi.doUnmock(moduleId);
  vi.resetModules();
};

const runAuthSmokeIntegration = async (): Promise<void> => {
  await resetIntegrationModules();
  if (process.env.TBIA_CONFIRM_DB_WRITE !== "1") {
    throw new Error(
      "Set TBIA_CONFIRM_DB_WRITE=1 to run against the test database",
    );
  }
  if (process.env.DB_NAME !== "tbia_test") {
    throw new Error(
      "Auth smoke test requires DB_NAME=tbia_test; refusing to write to any other database",
    );
  }

  process.env.NODE_ENV = "test";
  process.env.FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:5173";
  process.env.JWT_ACCESS_SECRET =
    "tbia-auth-smoke-test-secret-value-with-32-chars";
  process.env.SMTP_HOST = "";
  process.env.SMTP_PORT = "";
  process.env.SMTP_USER = "";
  process.env.SMTP_PASSWORD = "";

  const { default: pool } = await import("../src/config/database.js");
  const { default: app } = await import("../src/app.js");
  const { createPasswordReset } =
    await import("../src/modules/auth/repositories/password-reset.repository.js");

  const database = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  if (database.rows[0].name !== "tbia_test") {
    await pool.end();
    throw new Error("Auth smoke test is restricted to the tbia_test database");
  }

  const email = `auth-smoke-${crypto.randomUUID()}@example.invalid`;
  const targetEmail = `auth-smoke-target-${crypto.randomUUID()}@example.invalid`;
  let testEditionId: number | null = null;
  let testCategoryId: number | null = null;
  const initialPassword = "Smoke.Test.Password.2026!";
  const replacementPassword = "Smoke.Reset.Password.2026!";
  const resetToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const cookieFrom = (response: {
    headers: Record<string, unknown>;
  }): string => {
    const header = response.headers["set-cookie"] as string[] | undefined;
    const cookie = header?.find((value) =>
      value.startsWith("tbia_refresh_token="),
    );
    assert.ok(cookie, "Expected the refresh-token cookie");
    return cookie.split(";")[0];
  };

  try {
    const registration = await request(app).post("/api/v1/auth/register").send({
      account_type: "business",
      full_name: "Auth Smoke Test",
      email,
      password: initialPassword,
      password_confirmation: initialPassword,
      accept_terms: true,
    });

    assert.equal(registration.status, 201);
    const uid = registration.body.user.uid as string;
    const storedUser = await pool.query<{
      id: string;
      accept_terms: boolean;
      role_slug: string;
    }>(
      `SELECT u.id, u.accept_terms, r.slug AS role_slug
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.uid = $1`,
      [uid],
    );
    assert.equal(storedUser.rows[0]?.accept_terms, true);
    assert.equal(storedUser.rows[0]?.role_slug, "registered_business");
    console.log("PASS registration, uid, accepted terms, and business role");

    const verificationToken = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [
        storedUser.rows[0].id,
        crypto.createHash("sha256").update(verificationToken).digest("hex"),
      ],
    );
    const verificationPage = await request(app).get(
      `/api/v1/auth/verify-email?token=${verificationToken}`,
    );
    assert.equal(verificationPage.status, 200);
    assert.match(verificationPage.text, /Confirm email/);
    const verification = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: verificationToken });
    assert.equal(verification.status, 200);
    const verifiedUser = await pool.query<{
      status: string;
      is_verified: boolean;
    }>("SELECT status, is_verified FROM users WHERE uid = $1", [uid]);
    assert.equal(verifiedUser.rows[0]?.status, "active");
    assert.equal(verifiedUser.rows[0]?.is_verified, true);
    console.log(
      "PASS email verification form and one-time backend verification",
    );

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: initialPassword });
    assert.equal(login.status, 200);
    assert.ok(login.body.data.accessToken);
    assert.equal(login.body.data.refreshToken, undefined);
    const firstCookie = cookieFrom(login);
    console.log("PASS login returns access token and HttpOnly refresh cookie");

    const selfProfile = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    assert.equal(selfProfile.status, 200);
    assert.equal(selfProfile.body.data.uid, uid);

    const profileUpdate = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ region: "Dar es Salaam", bio: "Temporary integration profile" });
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.body.data.region, "Dar es Salaam");

    const businessRegistration = await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        organisation_name: "TBIA Smoke Business",
        sector: "Technology",
        registration_number: `SMOKE-${crypto.randomUUID()}`,
        region: "Dar es Salaam",
      });
    assert.equal(businessRegistration.status, 201);
    const businessId = String(businessRegistration.body.data.id);
    assert.equal(businessRegistration.body.data.verification_status, "pending");

    const pendingPublic = await request(app).get(
      `/api/v1/businesses/${businessId}`,
    );
    assert.equal(pendingPublic.status, 404);

    const mine = await request(app)
      .get("/api/v1/businesses/mine")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data[0]?.id, businessId);
    console.log(
      "PASS business registration, owner scoping, and pending privacy",
    );

    const forbiddenDirectory = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    assert.equal(forbiddenDirectory.status, 403);
    console.log("PASS self-profile access/update and user-directory RBAC");

    const adminUser = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE uid = $1",
      [uid],
    );
    const superAdminRole = await pool.query<{ id: number }>(
      "SELECT id FROM roles WHERE slug = 'super_admin'",
    );
    await pool.query("DELETE FROM user_roles WHERE user_id = $1", [
      adminUser.rows[0].id,
    ]);
    await pool.query(
      "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
      [adminUser.rows[0].id, superAdminRole.rows[0].id],
    );
    await pool.query("UPDATE users SET role_id = $2 WHERE uid = $1", [
      uid,
      superAdminRole.rows[0].id,
    ]);

    const existingYears = await pool.query<{ year: number }>(
      "SELECT year FROM award_editions",
    );
    const usedYears = new Set(existingYears.rows.map((row) => row.year));
    const editionYear = Array.from(
      { length: 101 },
      (_, index) => 2100 - index,
    ).find((year) => !usedYears.has(year));
    assert.ok(editionYear, "Expected an unused award edition year");
    const categoryGroup = await pool.query<{ id: number }>(
      "SELECT id FROM category_groups ORDER BY id LIMIT 1",
    );
    assert.equal(categoryGroup.rowCount, 1);

    const editionResponse = await request(app)
      .post("/api/v1/awards/editions")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        year: editionYear,
        name: `Auth Smoke Edition ${editionYear}`,
        nominations_open_at: `${editionYear}-01-01T00:00:00Z`,
        nominations_close_at: `${editionYear}-05-01T00:00:00Z`,
      });
    assert.equal(editionResponse.status, 201);
    testEditionId = editionResponse.body.data.id as number;

    const testSlug = `auth-smoke-${crypto.randomUUID().slice(0, 8)}`;
    const categoryResponse = await request(app)
      .post("/api/v1/awards/categories")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        group_id: categoryGroup.rows[0].id,
        name: `Auth Smoke ${testSlug}`,
        slug: testSlug,
        nominee_type: "business",
      });
    assert.equal(categoryResponse.status, 201);
    testCategoryId = categoryResponse.body.data.id as number;

    const categoryConfig = await request(app)
      .put(
        `/api/v1/awards/editions/${testEditionId}/categories/${testCategoryId}`,
      )
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        selection_method: "hybrid",
        jury_weight_percent: 70,
        vote_weight_percent: 30,
        max_finalists: 5,
      });
    assert.equal(categoryConfig.status, 200);

    const openNominations = await request(app)
      .patch(`/api/v1/awards/editions/${testEditionId}/status`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ status: "nominations_open" });
    assert.equal(openNominations.status, 200);
    const invalidTransition = await request(app)
      .patch(`/api/v1/awards/editions/${testEditionId}/status`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ status: "completed" });
    assert.equal(invalidTransition.status, 409);
    console.log(
      "PASS edition/category setup, weighted scoring, and status lifecycle",
    );

    const targetRegistration = await request(app)
      .post("/api/v1/auth/register")
      .send({
        account_type: "individual",
        full_name: "Auth Smoke Target",
        email: targetEmail,
        password: initialPassword,
        password_confirmation: initialPassword,
        accept_terms: true,
      });
    assert.equal(targetRegistration.status, 201);
    const targetUid = targetRegistration.body.user.uid as string;

    const adminList = await request(app)
      .get(`/api/v1/users?search=${encodeURIComponent(targetEmail)}`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.data[0]?.uid, targetUid);

    const businessApproval = await request(app)
      .patch(`/api/v1/businesses/${businessId}/verification`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ verification_status: "approved" });
    assert.equal(businessApproval.status, 200);
    const publicBusiness = await request(app).get(
      `/api/v1/businesses/${businessId}`,
    );
    assert.equal(publicBusiness.status, 200);
    assert.equal(publicBusiness.body.data.verification_status, "approved");
    console.log("PASS admin approval publishes business profile");

    const roleAssignment = await request(app)
      .put(`/api/v1/users/${targetUid}/roles`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ roleSlugs: ["registered_individual", "judge"] });
    assert.equal(roleAssignment.status, 200);
    const assignedRoles = await pool.query<{ slug: string }>(
      `SELECT r.slug FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = (SELECT id FROM users WHERE uid = $1)
       ORDER BY r.slug`,
      [targetUid],
    );
    assert.deepEqual(
      assignedRoles.rows.map((row) => row.slug),
      ["judge", "registered_individual"],
    );
    console.log("PASS super-admin multiple-role assignment");

    const statusChange = await request(app)
      .patch(`/api/v1/users/${targetUid}/status`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ status: "suspended" });
    assert.equal(statusChange.status, 200);

    const deletion = await request(app)
      .delete(`/api/v1/users/${targetUid}`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    assert.equal(deletion.status, 204);
    const deletedTarget = await pool.query<{
      status: string;
      deleted_at: Date | null;
    }>("SELECT status, deleted_at FROM users WHERE uid = $1", [targetUid]);
    assert.equal(deletedTarget.rows[0]?.status, "deactivated");
    assert.ok(deletedTarget.rows[0]?.deleted_at);
    console.log("PASS admin search, status change, and soft deletion");

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstCookie);
    assert.equal(refresh.status, 200);
    assert.ok(refresh.body.data.accessToken);
    const rotatedCookie = cookieFrom(refresh);
    console.log("PASS refresh rotates the refresh token");

    const forgot = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email });
    assert.equal(forgot.status, 200);
    console.log("PASS forgot-password returns a non-enumerating response");

    await createPasswordReset(
      email,
      tokenHash,
      new Date(Date.now() + 30 * 60 * 1000),
    );
    const reset = await request(app).post("/api/v1/auth/reset-password").send({
      token: resetToken,
      password: replacementPassword,
      password_confirmation: replacementPassword,
    });
    assert.equal(reset.status, 200);

    const reusedReset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: resetToken,
        password: replacementPassword,
        password_confirmation: replacementPassword,
      });
    assert.equal(reusedReset.status, 400);

    const revokedRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotatedCookie);
    assert.equal(revokedRefresh.status, 401);
    console.log("PASS password reset is one-time and revokes refresh sessions");

    const oldPasswordLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: initialPassword });
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: replacementPassword });
    assert.equal(newPasswordLogin.status, 200);
    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookieFrom(newPasswordLogin));
    assert.equal(logout.status, 200);
    console.log("PASS reset password works; logout revokes its refresh token");
  } finally {
    if (testEditionId !== null) {
      const links = await pool.query<{ id: number }>(
        "SELECT id FROM edition_categories WHERE edition_id = $1",
        [testEditionId],
      );
      for (const link of links.rows) {
        await pool.query(
          "DELETE FROM audit_logs WHERE entity_type = 'edition_categories' AND entity_id = $1",
          [link.id],
        );
      }
      await pool.query("DELETE FROM edition_categories WHERE edition_id = $1", [
        testEditionId,
      ]);
      await pool.query(
        "DELETE FROM audit_logs WHERE entity_type = 'award_editions' AND entity_id = $1",
        [testEditionId],
      );
      await pool.query("DELETE FROM award_editions WHERE id = $1", [
        testEditionId,
      ]);
    }
    if (testCategoryId !== null) {
      await pool.query(
        "DELETE FROM audit_logs WHERE entity_type = 'award_categories' AND entity_id = $1",
        [testCategoryId],
      );
      await pool.query("DELETE FROM award_categories WHERE id = $1", [
        testCategoryId,
      ]);
    }
    for (const testEmail of [email, targetEmail]) {
      const user = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1",
        [testEmail],
      );
      if (user.rowCount) {
        const userId = user.rows[0].id;
        const businesses = await pool.query<{ id: string }>(
          "SELECT id FROM business_profiles WHERE owner_user_id = $1",
          [userId],
        );
        for (const business of businesses.rows) {
          await pool.query(
            "DELETE FROM audit_logs WHERE entity_type = 'business_profiles' AND entity_id = $1",
            [business.id],
          );
          await pool.query("DELETE FROM business_profiles WHERE id = $1", [
            business.id,
          ]);
        }
        await pool.query("DELETE FROM email_verifications WHERE user_id = $1", [
          userId,
        ]);
        await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [
          userId,
        ]);
        await pool.query("DELETE FROM user_profiles WHERE user_id = $1", [
          userId,
        ]);
        await pool.query("DELETE FROM password_resets WHERE email = $1", [
          testEmail,
        ]);
        await pool.query("DELETE FROM login_attempts WHERE email = $1", [
          testEmail,
        ]);
        await pool.query(
          "DELETE FROM audit_logs WHERE user_id = $1 OR entity_id = $1",
          [userId],
        );
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      }
    }
    await pool.end();
  }
};

const runEmailE2EIntegration = async (): Promise<void> => {
  await resetIntegrationModules();
  if (process.env.TBIA_CONFIRM_EMAIL_SEND !== "1") {
    throw new Error("Set TBIA_CONFIRM_EMAIL_SEND=1 to send test emails");
  }
  if (process.env.DB_NAME !== "tbia_test") {
    throw new Error(
      "Email E2E test requires DB_NAME=tbia_test; refusing to create data in any other database",
    );
  }

  const recipient = process.env.TBIA_EMAIL?.trim();

  if (!recipient || !/^[^@\s]+@gmail\.com$/i.test(recipient)) {
    throw new Error("Set TBIA_EMAIL to a Gmail inbox address");
  }

  const [localPart, domain] = recipient.split("@");
  const email = `${localPart}+tbia-${crypto.randomBytes(4).toString("hex")}@${domain}`;
  const password = `${crypto.randomBytes(16).toString("base64url")}A1!`;
  process.env.PUBLIC_API_URL ||= `http://localhost:${process.env.PORT || 5000}`;
  process.env.JWT_ACCESS_SECRET ||= crypto.randomBytes(32).toString("hex");

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP configuration is incomplete");
  }

  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" },
  });
  await transporter.verify();
  await transporter.close();

  const [{ default: pool }, { default: app }] = await Promise.all([
    import("../src/config/database.js"),
    import("../src/app.js"),
  ]);

  try {
    const database = await pool.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    assert.equal(
      database.rows[0]?.name,
      "tbia_test",
      "Refusing to send from any database other than tbia_test",
    );

    const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [
      email,
    ]);
    assert.equal(existing.rowCount, 0, "Generated test email already exists");

    const registration = await request(app).post("/api/v1/auth/register").send({
      account_type: "individual",
      full_name: "TBIA Email Test",
      email,
      password,
      password_confirmation: password,
      accept_terms: true,
    });

    assert.equal(registration.status, 201);
    assert.equal(registration.body.verificationEmailSent, true);

    const forgotPassword = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email });
    assert.equal(forgotPassword.status, 200);

    const temporaryUser = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE uid = $1",
      [registration.body.user.uid],
    );
    assert.equal(temporaryUser.rowCount, 1);
    const emailRows = await pool.query(
      "SELECT 1 FROM email_verifications WHERE user_id = $1",
      [temporaryUser.rows[0].id],
    );
    const resetRows = await pool.query(
      "SELECT 1 FROM password_resets WHERE email = $1",
      [email],
    );
    assert.ok(emailRows.rowCount && emailRows.rowCount > 0);
    assert.ok(resetRows.rowCount && resetRows.rowCount > 0);

    console.log(
      "SMTP verified; verification and reset messages were accepted for delivery.",
    );
    console.log(`Inbox alias: ${email}`);
    console.log(`Temporary test password: ${password}`);
    console.log(
      "The temporary account is intentionally retained so the emailed links remain usable.",
    );
  } finally {
    await pool.end();
  }
};

describe.skipIf(process.env.TBIA_CONFIRM_DB_WRITE !== "1")(
  "auth smoke integration",
  () => {
    it("runs the guarded auth workflow against tbia_test", async () => {
      await runAuthSmokeIntegration();
    }, 120_000);
  },
);

describe.skipIf(process.env.TBIA_CONFIRM_EMAIL_SEND !== "1")(
  "email E2E integration",
  () => {
    it("sends verification and reset emails to the configured inbox", async () => {
      await runEmailE2EIntegration();
    }, 120_000);
  },
);
