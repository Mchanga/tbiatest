import { z } from "zod";

const businessFields = {
  organisation_name: z.string().trim().min(2).max(190),
  sector: z.string().trim().max(120),
  registration_number: z.string().trim().max(80),
  tin: z.string().trim().max(30),
  website: z.string().url().max(255),
  description: z.string().trim().max(10_000),
  country: z.string().trim().min(2).max(80),
  region: z.string().trim().max(80),
  district_city: z.string().trim().max(80),
  year_established: z.number().int().min(1800).max(2100),
  employees_count: z.number().int().min(0).max(100_000_000),
};

export const createBusinessSchema = z.object({
  organisation_name: businessFields.organisation_name,
  sector: businessFields.sector.optional(),
  registration_number: businessFields.registration_number.optional(),
  tin: businessFields.tin.optional(),
  website: businessFields.website.optional(),
  description: businessFields.description.optional(),
  country: businessFields.country.optional(),
  region: businessFields.region.optional(),
  district_city: businessFields.district_city.optional(),
  year_established: businessFields.year_established.optional(),
  employees_count: businessFields.employees_count.optional(),
}).strict();

export const updateBusinessSchema = z.object({
  ...Object.fromEntries(
    Object.entries(businessFields).map(([field, schema]) => [field, schema.optional()])
  ),
}).strict().refine(
  (value) => Object.values(value).some((entry) => entry !== undefined),
  { message: "At least one field must be provided" }
);

export const businessSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(190).optional(),
  region: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(120).optional(),
  verification_status: z.enum([
    "pending",
    "under_review",
    "approved",
    "rejected",
    "suspended",
  ]).optional(),
}).strict();

export const businessVerificationSchema = z.object({
  verification_status: z.enum([
    "pending",
    "under_review",
    "approved",
    "rejected",
    "suspended",
  ]),
}).strict();

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type BusinessSearchQuery = z.infer<typeof businessSearchSchema>;