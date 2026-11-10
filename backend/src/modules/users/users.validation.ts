import { z } from "zod";

export const updateOwnProfileSchema = z
  .object({
    full_name: z.string().trim().min(2).max(150).optional(),
    phone: z.string().trim().min(7).max(30).optional(),
    country: z.string().trim().min(2).max(100).optional(),
    region: z.string().trim().max(100).optional(),
    district_city: z.string().trim().max(100).optional(),
    address: z.string().trim().max(500).optional(),
    bio: z.string().trim().max(2000).optional(),
    linkedin_url: z.string().url().max(255).optional(),
    preferred_language: z.enum(["en", "sw"]).optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "At least one field must be provided" },
  );

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(150).optional(),
    status: z
      .enum(["pending", "active", "suspended", "deactivated"])
      .optional(),
    role: z.string().trim().max(50).optional(),
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    status: z.enum(["pending", "active", "suspended", "deactivated"]),
  })
  .strict();

export const updateUserSchema = z
  .object({
    full_name: z.string().trim().min(2).max(150).optional(),
    phone: z.union([z.string().trim().min(7).max(30), z.null()]).optional(),
    country: z.union([z.string().trim().min(2).max(100), z.null()]).optional(),
    region: z.union([z.string().trim().max(100), z.null()]).optional(),
    district_city: z.union([z.string().trim().max(100), z.null()]).optional(),
    address: z.union([z.string().trim().max(500), z.null()]).optional(),
    bio: z.union([z.string().trim().max(2000), z.null()]).optional(),
    linkedin_url: z.union([z.string().url().max(255), z.null()]).optional(),
    preferred_language: z.enum(["en", "sw"]).optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "At least one field must be provided" },
  );

export const assignUserRolesSchema = z
  .object({
    roleSlugs: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9_]+$/),
      )
      .min(1)
      .max(20)
      .refine((slugs) => new Set(slugs).size === slugs.length, {
        message: "Role slugs must be unique",
      }),
  })
  .strict();

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignUserRolesInput = z.infer<typeof assignUserRolesSchema>;
