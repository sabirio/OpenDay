import { z } from 'zod';

// Validates the shape siteVisitService.mapRow() produces — a merge of the raw
// snake_case site_visits row plus added camelCase fields (projectId, visitDate,
// etc). .passthrough() so the still-present snake_case duplicates (project_id,
// visit_date, ...) and the per-WP `wps` array aren't stripped.

// site_visit_wps row, validated independently (P1.3) before being attached to
// its visit in mapRow() — siteVisitEngine reads gc_progress/observed_progress/
// discrepancy_delta with `?? null`/`?? 0`, which only guards null/undefined,
// not a corrupted non-numeric value. Not modeled inside SiteVisitSchema itself
// (a nested array there would fail the whole visit on one bad WP row instead
// of just dropping that row — see the same fix in projectSchema.js).
export const SiteVisitWPSchema = z.object({
  wp_id: z.string().nullable().optional(),
  phase_id: z.string().nullable().optional(),
  gc_status: z.string().nullable().optional(),
  observed_status: z.string().nullable().optional(),
  gc_progress: z.number().nullable().optional(),
  observed_progress: z.number().nullable().optional(),
  discrepancy_delta: z.number().nullable().optional(),
  pm_note: z.string().nullable().optional(),
}).passthrough();

export const SiteVisitSchema = z.object({
  id: z.union([z.number(), z.string()]),
  projectId: z.union([z.number(), z.string()]),
  visitDate: z.string().nullable().optional(),
  visitedBy: z.string().nullable().optional(),
  pmScheduleAssessment: z.string().nullable().optional(),
}).passthrough();
