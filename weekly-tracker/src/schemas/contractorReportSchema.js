import { z } from 'zod';

// Validates the shape contractorReportAdapter.adaptContractorReportToLegacy()
// produces (camelCase legacy report shape) — this, not the raw contractor_reports
// row, is what actually reaches useAllRows()/engines via
// getAllReportsForScreens()/getReportsForProjectForScreens(). id/projectId are
// plain integers in this DB, not UUIDs. submittedBy is nullable in practice
// (some rows have it null) even though the write path always sets it to a
// UUID going forward — see engines/__tests__ Test C (ownership).

const WPTaskEntrySchema = z.object({
  status: z.string(),
  progress: z.number().nullable().optional(),
  comment: z.string().nullable().optional(),
  workGroupId: z.string().uuid().nullable().optional(),
}).passthrough();

export const ContractorReportSchema = z.object({
  id: z.union([z.number(), z.string()]),
  projectId: z.union([z.number(), z.string()]),
  reportingDate: z.string(),
  submittedAt: z.string().nullable().optional(),
  overallProgress: z.number().min(0).max(100).nullable().optional(),
  submittedBy: z.string().nullable().optional(),
  projectScheduleStatus: z.string().nullable().optional(),
  workPackageStatuses: z.record(z.string(), z.record(z.string(), WPTaskEntrySchema)).optional(),
  photos: z.array(z.string()).optional(),
  workOntologyVersionId: z.string().uuid().nullable().optional(),
  reportedWorkGroupIds: z.array(z.string().uuid()).optional(),
  riskWorkGroupIds: z.array(z.string().uuid()).optional(),
}).passthrough();
