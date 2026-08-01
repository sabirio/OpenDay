// Core data types are inferred from the Zod schemas in src/schemas/ — those
// schemas validate what services actually return (post fromDB()/adapter
// mapping), so they're the single source of truth for these shapes rather
// than a hand-written duplicate that can drift out of sync.
import type { z } from 'zod';
import type { ProjectSchema } from '../schemas/projectSchema';
import type { ContractorReportSchema } from '../schemas/contractorReportSchema';
import type { SiteVisitSchema } from '../schemas/siteVisitSchema';

export type Project = z.infer<typeof ProjectSchema>;
export type ContractorReport = z.infer<typeof ContractorReportSchema>;
export type SiteVisit = z.infer<typeof SiteVisitSchema>;

// ── Engine result shapes ────────────────────────────────────────────────────
// These describe what engines COMPUTE, not what Supabase returns — modeled
// directly from the real progressEngine.js / pmAlignmentEngine.js /
// portfolioEngine.js / spiEngine.js implementations.

export interface PhaseBreakdown {
  id: string;
  name: string;
  pct: number;
  count: number;
}

export interface ProgressResult {
  format: 'gantt' | 'legacy' | 'none';
  progress: number;
  phases: PhaseBreakdown[];
}

export interface AlignmentItem {
  name: string;
  wpId: string | null;
  taskName: string | null;
  gcStatus: string;
  pmStatus: string;
  gcScore: number;
  pmScore: number;
  diff: number;
  overstate: boolean;
  match: boolean;
  mismatchType: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | null;
}

export interface AlignmentSummary {
  matchRate: number;
  overstatements: AlignmentItem[];
  matches: AlignmentItem[];
}

export interface PortfolioKpis {
  active: number;
  total: number;
  atRisk: number;
  critical: number;
  missing: number;
  blocked: number;
  support: number;
  newOpening: number;
  rebuilding: number;
  avgProgress: number;
  reportsThisWeek: number;
  openingSoon: number;
}

export interface CriticalHealth {
  total: number;
  behind: number;
  ratio: number;
  // 'no_schedule' (SCHEDULE-DEBT-01 fix, Simplification Phase 3B.1): the
  // project has critical tasks, but none of them have a schedule yet — a
  // lack-of-data state, distinct from 'healthy' (which also covers the
  // case of genuinely zero critical tasks) and never 'warning'/'critical'.
  label: 'healthy' | 'warning' | 'critical' | 'no_schedule';
}
