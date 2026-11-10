import { z } from "zod";

export const nominationKindSchema = z.enum([
  "self",
  "business",
  "entrepreneur",
  "investor",
  "company",
  "institution",
]);

export const nominationStatusSchema = z.enum([
  "draft",
  "submitted",
  "under_review",
  "pending_information",
  "approved",
  "rejected",
  "shortlisted",
  "finalist",
  "winner",
]);

export const createNominationSchema = z
  .object({
    edition_category_id: z.coerce.number().int().positive(),
    nomination_kind: nominationKindSchema,
    nominee_user_id: z.coerce.number().int().positive().optional(),
    nominee_business_id: z.coerce.number().int().positive().optional(),
    nominee_full_name: z.string().trim().min(2).max(200),
    nominee_organisation: z.string().trim().max(200).optional(),
    nominee_email: z.string().trim().email().max(255).optional(),
    nominee_phone: z.string().trim().max(30).optional(),
    nominee_photo_path: z.string().trim().max(255).optional(),
    business_profile: z.string().trim().max(2000).optional(),
    reason_for_nomination: z.string().trim().min(20).max(10000),
    achievements: z.string().trim().max(10000).optional(),
    business_impact: z.string().trim().max(10000).optional(),
    supporting_links: z.any().optional(),
    consent_accepted: z.boolean(),
    status: z.enum(["draft", "submitted"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.nominee_user_id !== undefined ||
      value.nominee_business_id !== undefined,
    {
      message: "A nominee user or business must be provided",
      path: ["nominee_user_id"],
    },
  )
  .refine((value) => !(value.nominee_user_id && value.nominee_business_id), {
    message: "Choose either a nominee user or nominee business, not both",
    path: ["nominee_business_id"],
  });

export const updateNominationStatusSchema = z
  .object({
    status: nominationStatusSchema,
    rejection_reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateNominationContentSchema = z
  .object({
    nominee_full_name: z.string().trim().min(2).max(200).optional(),
    nominee_organisation: z.string().trim().max(200).nullable().optional(),
    nominee_email: z.string().trim().email().max(255).nullable().optional(),
    nominee_phone: z.string().trim().max(30).nullable().optional(),
    nominee_photo_path: z.string().trim().max(255).nullable().optional(),
    reason_for_nomination: z.string().trim().min(20).max(10000).optional(),
    achievements: z.string().trim().max(10000).nullable().optional(),
    business_impact: z.string().trim().max(10000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    {
      message: "At least one field must be provided",
    },
  );

export const nominationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    status: nominationStatusSchema.optional(),
  })
  .strict();

export type CreateNominationInput = z.infer<typeof createNominationSchema>;
export type UpdateNominationStatusInput = z.infer<
  typeof updateNominationStatusSchema
>;
export type UpdateNominationContentInput = z.infer<
  typeof updateNominationContentSchema
>;
export type NominationListQuery = z.infer<typeof nominationListQuerySchema>;
