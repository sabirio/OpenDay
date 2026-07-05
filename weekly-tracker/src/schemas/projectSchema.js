import { z } from 'zod';

// Validates the shape projectService.fromDB() actually produces (camelCase),
// not the raw snake_case Supabase row — that's what pages/engines consume.
// project.id / template_id are plain integers in this DB, not UUIDs.
// .passthrough() everywhere: this only guards the handful of fields engines
// compute directly with (id, storeCode, dates, scope, progressHistory) —
// unmodeled fields (phases, gantt* fields, etc.) pass through unchanged
// instead of being silently stripped by a stricter schema.

const ScopeSchema = z.object({
  workPackages: z.array(z.string()).optional(),
  weightOverrides: z.record(z.string(), z.number()).optional(),
}).passthrough().nullable().optional();

const ProgressHistoryRowSchema = z.object({
  overall_progress: z.number().nullable().optional(),
  recorded_at: z.string().nullable().optional(),
  week_number: z.number().nullable().optional(),
}).passthrough();

export const ProjectSchema = z.object({
  id: z.union([z.number(), z.string()]),
  storeCode: z.string().min(1),
  shoppingMallName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  constructionStartDate: z.string().nullable().optional(),
  constructionEndDate: z.string().nullable().optional(),
  targetOpeningDate: z.string().nullable().optional(),
  templateId: z.union([z.string(), z.number()]).nullable().optional(),
  scope: ScopeSchema,
  progressHistory: z.array(ProgressHistoryRowSchema).optional(),
}).passthrough();

export const ProjectArraySchema = z.array(ProjectSchema);
