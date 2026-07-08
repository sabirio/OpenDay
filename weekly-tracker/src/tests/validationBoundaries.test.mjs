// validationBoundaries.test.mjs — P1.3 data-validation boundary contract.
// Run: node src/tests/validationBoundaries.test.mjs
//
// Covers:
//   A) validate.js — malformed/null Supabase responses never throw or crash
//   B) ProgressHistoryRowSchema — one bad progress_history row no longer sinks
//      the whole project (projectService.getAll() validates it independently,
//      per-project, before embedding it in ProjectSchema)
//   C) ContractorReportSchema — a malformed contractor_report_wps row, once
//      through the adapter's numeric coercion, still produces a report that
//      passes schema validation (doesn't silently disappear from the list)
//   D) SiteVisitWPSchema — malformed site_visit_wps rows are dropped
//      individually instead of reaching siteVisitEngine's discrepancy math
//
// All imports here are plain relative imports with explicit extensions
// (zod + schema files + the adapter) — no Vite-style extensionless imports,
// so this runs under plain `node` with no loader needed.

import { validateArray, validateOne } from '../schemas/validate.js';
import { ProjectSchema, ProgressHistoryRowSchema } from '../schemas/projectSchema.js';
import { ContractorReportSchema } from '../schemas/contractorReportSchema.js';
import { SiteVisitSchema, SiteVisitWPSchema } from '../schemas/siteVisitSchema.js';
import { adaptContractorReportToLegacy } from '../core/contractorReport/adaptContractorReportToLegacy.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// ── A) validate.js — malformed/null Supabase responses ────────────────────────

console.log('\nA) validate.js — malformed/null input never throws');

check('validateArray(null) returns [] instead of throwing',
  JSON.stringify(validateArray(ProjectSchema, null, 'projects')) === '[]');
check('validateArray(undefined) returns []',
  JSON.stringify(validateArray(ProjectSchema, undefined, 'projects')) === '[]');
check('validateArray(single object, not array) returns []',
  JSON.stringify(validateArray(ProjectSchema, { id: 1 }, 'projects')) === '[]');
check('validateOne(null) returns null instead of throwing',
  validateOne(ProjectSchema, null, 'project') === null);
check('validateOne(malformed object missing required field) returns null',
  validateOne(ProjectSchema, { shoppingMallName: 'no id or storeCode' }, 'project') === null);

{
  const goodProject = { id: 1, storeCode: 'HM-1' };
  const badProject = { shoppingMallName: 'missing required fields' };
  const result = validateArray(ProjectSchema, [goodProject, badProject], 'projects');
  check('one bad item in an array is dropped, the good one survives', result.length === 1 && result[0].id === 1);
}

// ── B) ProgressHistoryRowSchema — bad nested row doesn't sink the project ─────

console.log('\nB) ProgressHistoryRowSchema — malformed history row is isolated, not fatal to the project');

{
  const rawHistory = [
    { overall_progress: 45, recorded_at: '2026-06-01', week_number: 22 },
    { overall_progress: 'corrupted-not-a-number', recorded_at: '2026-06-08', week_number: 23 },
  ];

  // This mirrors projectService.getAll()'s fix: validate the nested collection
  // independently BEFORE embedding it, instead of passing the raw array straight
  // into ProjectSchema (which would fail the whole project on the bad row).
  const cleanedHistory = validateArray(ProgressHistoryRowSchema, rawHistory, 'progress_history[project 1]');
  check('bad history row is dropped, good one kept', cleanedHistory.length === 1 && cleanedHistory[0].overall_progress === 45);

  const projectWithCleanedHistory = validateOne(ProjectSchema, { id: 1, storeCode: 'HM-1', progressHistory: cleanedHistory }, 'project');
  check('project embedding the pre-filtered history still validates', projectWithCleanedHistory !== null);

  // Demonstrates what the bug used to look like: embedding the RAW (unfiltered)
  // history array causes the whole project to fail validation.
  const projectWithRawHistory = validateOne(ProjectSchema, { id: 1, storeCode: 'HM-1', progressHistory: rawHistory }, 'project');
  check('embedding the raw unfiltered history instead fails the whole project (regression guard)', projectWithRawHistory === null);
}

// ── C) ContractorReportSchema — adapter coercion keeps a report alive ─────────

console.log('\nC) ContractorReportSchema — adapted report survives a malformed WP row');

{
  const adapted = adaptContractorReportToLegacy(
    { id: 900, project_id: 71, report_date: '2026-07-05', overall_progress: 'garbage' },
    [{ wp_id: 'demo.strip_out', status: 'in_progress', progress_pct: 'also-garbage' }],
  );
  const validated = validateOne(ContractorReportSchema, adapted, 'contractor_report');
  check('adapted report with originally-malformed fields still passes schema validation', validated !== null);
  check('overallProgress ended up as a safe number', typeof validated.overallProgress === 'number');
}

// ── D) SiteVisitWPSchema — malformed WP observations are dropped individually ─

console.log('\nD) SiteVisitWPSchema — malformed observations filtered, valid ones kept');

{
  const rawWps = [
    { wp_id: 'demo.strip_out', phase_id: 'demolition', gc_status: 'completed', observed_status: 'in_progress', gc_progress: 100, observed_progress: 60, discrepancy_delta: -40 },
    { wp_id: 'demo.structural', phase_id: 'demolition', gc_status: 'completed', observed_status: 'completed', gc_progress: 'not-a-number', observed_progress: 100, discrepancy_delta: 0 },
  ];
  const cleaned = validateArray(SiteVisitWPSchema, rawWps, 'site_visit_wps[visit 1]');
  check('malformed gc_progress row is dropped', cleaned.length === 1);
  check('the valid observation survives', cleaned[0].wp_id === 'demo.strip_out');

  const visit = validateOne(SiteVisitSchema, { id: 1, projectId: 71, wps: cleaned }, 'site_visit');
  check('visit with pre-filtered wps still validates', visit !== null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
