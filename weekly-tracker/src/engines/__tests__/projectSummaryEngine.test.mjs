// projectSummaryEngine.test.mjs — F-02 regression: the risk score/level shown
// in ProjectDetailDrawer.jsx (via computeProjectSummary) must never diverge
// from the canonical Home/Dashboard risk score/level (via evaluateProjectState)
// for the identical project, reports, and site visits.
// Run: node src/engines/__tests__/projectSummaryEngine.test.mjs

import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try { return await nextResolve(specifier + '.js', context); }
    catch { return nextResolve(specifier + '/index.js', context); }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeProjectSummary } = await import('../projectSummaryEngine.js');
const { evaluateProjectState } = await import('../../core/opendayEngine/evaluateProjectState.js');
const { computeWPCumulativeStatuses } = await import('../../utils/reportUtils.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const today = new Date();
const iso = (daysFromNow) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

console.log('\nF-02 — drawer risk (computeProjectSummary) vs. canonical risk (evaluateProjectState), same inputs');
{
  // v1 project, one report, virtually every blocker WP still "Not Started",
  // and a target opening date only 5 days out — engineered so
  // computeOpeningReadiness returns verdict: 'NOT_ACHIEVABLE', which is the
  // exact condition that exercises the +20pt "Opening not achievable" risk
  // factor (riskEngine.js) that F-02's missing 5th argument was silently
  // discarding.
  const project = {
    id: 'test-1',
    templateType: null, // v1
    scope: null,
    targetOpeningDate: iso(5),
    constructionStartDate: iso(-300),
    constructionEndDate: iso(5),
  };
  const report = {
    id: 1,
    reportingDate: iso(-1),
    submittedAt: iso(-1),
    projectScheduleStatus: 'At Risk',
    workPackageStatuses: {}, // nothing reported -> every v1 blocker WP flagged Not Started
  };
  const projReports = [report];
  const projSiteVisits = [];

  const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports);

  const state = evaluateProjectState(project, projReports, projSiteVisits);
  check('fixture actually reaches NOT_ACHIEVABLE (precondition for this test to mean anything)',
    state.readiness?.verdict === 'NOT_ACHIEVABLE');

  // Use evaluateProjectState's own computed progress as the `progress` input
  // to computeProjectSummary too, so this comparison isolates exactly the
  // readiness-argument question (F-02) rather than conflating it with the
  // separate, out-of-scope question of who computes `progress` itself.
  const summary = computeProjectSummary(project, projReports, projSiteVisits, state.progress, wpCumulativeStatuses);

  check('drawer risk.score includes the same "Opening not achievable" +20pt factor as the canonical score (F-02)',
    summary.risk.score === state.riskScore.score);
  check('drawer risk.level matches canonical riskLevel exactly (F-02 — the actual user-visible bug)',
    summary.risk.level === state.riskLevel);
}

console.log('\nF-02 — v1 project with an easily-achievable opening (verdict READY_TRACK/TIGHT) — sanity, no false positive');
{
  // Control case: readiness NOT NOT_ACHIEVABLE, so the +20pt factor should
  // legitimately be absent from both call sites equally — proves the fix
  // doesn't just coincidentally match on the critical path above.
  const project = {
    id: 'test-2',
    templateType: null,
    scope: null,
    targetOpeningDate: iso(400),
    constructionStartDate: iso(-30),
    constructionEndDate: iso(400),
  };
  const report = {
    id: 2,
    reportingDate: iso(-1),
    submittedAt: iso(-1),
    projectScheduleStatus: 'On Track',
    workPackageStatuses: {},
  };
  const projReports = [report];
  const projSiteVisits = [];
  const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports);

  const state = evaluateProjectState(project, projReports, projSiteVisits);
  const summary = computeProjectSummary(project, projReports, projSiteVisits, state.progress, wpCumulativeStatuses);

  check('control case is NOT NOT_ACHIEVABLE (confirms the two fixtures actually differ)',
    state.readiness?.verdict !== 'NOT_ACHIEVABLE');
  check('drawer and canonical risk score still match when the +20pt factor legitimately does not apply',
    summary.risk.score === state.riskScore.score);
  check('drawer and canonical risk level still match in the control case',
    summary.risk.level === state.riskLevel);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
