import { z } from "zod";
const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(64, "Password must not exceed 64 characters");
export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name is required")
      .max(150),

    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(254)
      .transform((value) => value.toLowerCase()),

    phone: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .optional(),

    account_type: z.enum([
      "business",
      "entrepreneur",
      "investor",
      "startup",
      "individual",
      "institution",
    ]),

    password: passwordSchema,

    password_confirmation: z.string(),

    accept_terms: z.boolean().refine(
      (value) => value === true,
      "You must accept the terms and conditions"
    ),
  })
  .strict()
  .refine(
    (data) => data.password === data.password_confirmation,
    {
      message: "Passwords do not match",
      path: ["password_confirmation"],
    }
  );
export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .transform((value) => value.toLowerCase()),

    password: z.string().min(1, "Password is required"),
  })
  .strict();
export const forgotPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),

    password: passwordSchema,

    password_confirmation: z.string(),
  })
  .strict()
  .refine(
    (data) => data.password === data.password_confirmation,
    {
      message: "Passwords do not match",
      path: ["password_confirmation"],
    }
  );
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<
  typeof forgotPasswordSchema
>;
export type ResetPasswordInput = z.infer<
  typeof resetPasswordSchema
>;



export const resendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),
}).strict();

export type ResendVerificationInput = z.infer<
  typeof resendVerificationSchema
>;