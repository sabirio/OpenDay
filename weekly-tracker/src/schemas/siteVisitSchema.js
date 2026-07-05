import { z } from 'zod';

// Validates the shape siteVisitService.mapRow() produces — a merge of the raw
// snake_case site_visits row plus added camelCase fields (projectId, visitDate,
// etc). .passthrough() so the still-present snake_case duplicates (project_id,
// visit_date, ...) and the per-WP `wps` array aren't stripped.

export const SiteVisitSchema = z.object({
  id: z.union([z.number(), z.string()]),
  projectId: z.union([z.number(), z.string()]),
  visitDate: z.string().nullable().optional(),
  visitedBy: z.string().nullable().optional(),
  pmScheduleAssessment: z.string().nullable().optional(),
}).passthrough();

export const SiteVisitArraySchema = z.array(SiteVisitSchema);
