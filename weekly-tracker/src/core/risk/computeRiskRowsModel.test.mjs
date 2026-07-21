// computeRiskRowsModel.test.mjs — first direct test against the REAL
// computeRiskRows() (the only prior test, src/hooks/useRiskRows.test.mjs,
// hand-mirrors the function with every real engine stubbed out — it
// verifies the composition contract only, never real engine behavior).
//
// Engine-audit regression (2026-07-16): computeScheduleDeviation was called
// with no referenceDate, silently defaulting to `new Date()` instead of
// using base.calculatedAt — the same reference instant already threaded to
// Monte Carlo's `asOf`. Builds `base` via the real
// buildCanonicalProjectRows() (dashboardProjectRowsModel.js — the actual
// production composition path useAllRows.js calls; NOT the deprecated
// evaluateProjectState() directly, whose own return value has no
// calculatedAt field at all) at a deliberately non-"now" calculatedAt so
// the bug (schedDev silently reflecting real-now instead of the row's own
// point in time) is observable.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      return nextResolve(specifier + '/index.js', context);
    }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildCanonicalProjectRows } = await import('../dashboard/dashboardProjectRowsModel.js');
const { computeRiskRows } = await import('./computeRiskRowsModel.js');
const { computeScheduleDeviation } = await import('../../engines/riskEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

const project = {
  id: 800,
  storeCode: 'RISK-ROWS-TEST',
  constructionStartDate: iso(now - 100 * DAY),
  constructionEndDate:   iso(now + 100 * DAY),
  targetOpeningDate:     iso(now + 100 * DAY),
  progressHistory: [],
  scope: null,
};

const report = {
  id: 1, projectId: 800, submittedAt: iso(now - 60 * DAY), reportingDate: iso(now - 60 * DAY),
  weekNumber: 1, overallProgress: 20, submittedBy: 'contractor-uid', projectScheduleStatus: 'On Track',
  workPackageStatuses: {}, photos: [], risks: [], riskOwners: [], supportTypes: [],
  currentPackages: [], currentPhases: [], sourceTable: 'contractor_reports',
};

// A deliberately non-"now" point in time — 30 days ago — so expectedPct at
// calculatedAt differs meaningfully from expectedPct at real "now" (project
// spans 200 days total, so 30 days is a ~15pp swing in expected progress).
const historicalCalculatedAt = iso(now - 30 * DAY);

console.log('\ncomputeRiskRows — schedDev uses base.calculatedAt, not real "now" (engine-audit regression)');
{
  const [base] = buildCanonicalProjectRows({
    projects: [project], reports: [report], siteVisits: [], calculatedAt: historicalCalculatedAt,
  });
  check('fixture sanity: base.calculatedAt was actually set to the historical date',
    base.calculatedAt === historicalCalculatedAt);

  const [row] = computeRiskRows([base], [project], [report], []);

  const expectedAtHistoricalDate = computeScheduleDeviation(project, base.progress, historicalCalculatedAt).expectedPct;
  const expectedAtRealNow        = computeScheduleDeviation(project, base.progress, new Date()).expectedPct;

  check('fixture is meaningful: expectedPct genuinely differs between calculatedAt and real now',
    expectedAtHistoricalDate !== expectedAtRealNow);
  check('row.schedDev.expectedPct matches base.calculatedAt, not real "now"',
    row.schedDev.expectedPct === expectedAtHistoricalDate);
  check('row.schedDev.expectedPct does NOT match a fresh new Date() call (the old bug)',
    row.schedDev.expectedPct !== expectedAtRealNow);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
