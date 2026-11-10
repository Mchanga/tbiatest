import { z } from "zod";

const isoDate = z.string().datetime({ offset: true }).optional();

export const createEditionSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  name: z.string().trim().min(2).max(150),
  theme: z.string().trim().max(255).optional(),
  description: z.string().trim().max(10_000).optional(),
  nominations_open_at: isoDate,
  nominations_close_at: isoDate,
  finale_date: isoDate,
  finale_venue: z.string().trim().max(255).optional(),
}).strict().refine(
  (value) => !value.nominations_open_at || !value.nominations_close_at ||
    new Date(value.nominations_open_at) < new Date(value.nominations_close_at),
  { message: "Nominations closing date must follow opening date", path: ["nominations_close_at"] }
);

export const updateEditionSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  name: z.string().trim().min(2).max(150).optional(),
  theme: z.string().trim().max(255).optional(),
  description: z.string().trim().max(10_000).optional(),
  nominations_open_at: isoDate,
  nominations_close_at: isoDate,
  finale_date: isoDate,
  finale_venue: z.string().trim().max(255).optional(),
  is_current: z.boolean().optional(),
}).strict().refine(
  (value) => !value.nominations_open_at || !value.nominations_close_at ||
    new Date(value.nominations_open_at) < new Date(value.nominations_close_at),
  { message: "Nominations closing date must follow opening date", path: ["nominations_close_at"] }
).refine(
  (value) => Object.values(value).some((entry) => entry !== undefined),
  { message: "At least one edition field must be provided" }
);

export const transitionEditionSchema = z.object({
  status: z.enum([
    "nominations_open",
    "judging",
    "voting",
    "finalised",
    "completed",
    "archived",
  ]),
}).strict();

export const createCategorySchema = z.object({
  group_id: z.number().int().positive(),
  name: z.string().trim().min(2).max(190),
  slug: z.string().trim().min(2).max(190).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(10_000).optional(),
  icon: z.string().trim().max(80).optional(),
  nominee_type: z.enum(["business", "individual", "institution", "any"]).default("any"),
  sort_order: z.number().int().min(0).max(32767).default(0),
}).strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

export const editionCategorySchema = z.object({
  is_active: z.boolean().default(true),
  selection_method: z.enum(["jury", "public_vote", "hybrid"]),
  jury_weight_percent: z.number().int().min(0).max(100),
  vote_weight_percent: z.number().int().min(0).max(100),
  eligibility_criteria: z.string().trim().max(10_000).optional(),
  nomination_guidelines: z.string().trim().max(10_000).optional(),
  max_finalists: z.number().int().min(1).max(100).default(5),
}).strict().refine(
  (value) => value.jury_weight_percent + value.vote_weight_percent === 100,
  { message: "Evaluation weights must total 100%", path: ["vote_weight_percent"] }
).refine(
  (value) => value.selection_method !== "jury" || value.jury_weight_percent === 100,
  { message: "Jury selection requires 100% jury weight", path: ["jury_weight_percent"] }
).refine(
  (value) => value.selection_method !== "public_vote" || value.vote_weight_percent === 100,
  { message: "Public vote selection requires 100% vote weight", path: ["vote_weight_percent"] }
);

export const idParamSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
export const yearParamSchema = z.coerce.number().int().min(2000).max(2100);

export type CreateEditionInput = z.infer<typeof createEditionSchema>;
export type UpdateEditionInput = z.infer<typeof updateEditionSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type EditionCategoryInput = z.infer<typeof editionCategorySchema>;