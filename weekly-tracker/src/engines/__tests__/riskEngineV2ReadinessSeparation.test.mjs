// riskEngineV2ReadinessSeparation.test.mjs
// Risk Engine v2 (2026-07-22): regression coverage for the reported false-
// positive — a freshly-created project with many future NOT_STARTED opening
// requirements was classified "Opening date at risk — Critical" with "23
// critical + 5 soft blockers remaining", purely because computeOpeningReadiness's
// `status` field was derived from raw blocker-count + day-thresholds instead
// of its own already-computed, time-aware verdict/slack signal.
//
// Core contract under test: NOT_STARTED != RISK. Opening Readiness may list
// many mandatory incomplete items (that's its job); Risk Engine/readiness
// `status` must only escalate when there's an actual schedule-feasibility or
// deviation signal — never from incompleteness alone.
//
// Uses the REAL orchestrator (runOpenDayOrchestrator) and REAL v1/v2
// templates throughout — no synthetic/hand-rolled readiness math — so these
// tests exercise the exact same code path the app runs.

import { register } from 'node:module';
const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { runOpenDayOrchestrator } = await import('../../core/canonical/index.js');
const { computeOpeningReadiness } = await import('../openingReadinessEngine.js');
const { V2_TEMPLATE_TYPE } = await import('../../domains/construction/templates/retailFitoutV2.js');
const { buildWeeklyReportExportModel } = await import('../../export/weekly/buildWeeklyReportExportModel.js');
const { WeeklyReportPdfTemplate } = await import('../../export/pdf/WeeklyReportPdfTemplate.js');
const { pdf } = await import('@react-pdf/renderer');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};

const TODAY = new Date('2026-07-20T00:00:00.000Z');
const isoInDays = (days) => new Date(TODAY.getTime() + days * 86400000).toISOString().slice(0, 10);
const isoDaysAgo = (days) => new Date(TODAY.getTime() - days * 86400000).toISOString().slice(0, 10);

function v2Project(overrides = {}) {
  return {
    id: 'p1',
    storeCode: 'NEW-01',
    templateType: V2_TEMPLATE_TYPE,
    scope: { zoneAreas: { sales: 700, boh: 300 }, zones: null, categories: null, workPackages: null },
    progressHistory: [],
    ...overrides,
  };
}

function v1Project(overrides = {}) {
  return {
    id: 'p2',
    storeCode: 'V1-01',
    scope: { workPackages: null, zoneAreas: { sales: 700, back: 300 } },
    progressHistory: [],
    ...overrides,
  };
}

function orchestrate(project, reports) {
  return runOpenDayOrchestrator({ project, contractorReports: reports, siteVisits: [] }, { calculatedAt: TODAY.toISOString() });
}

// ── 1. Future NOT_STARTED item: expected=0, actual=0 => no risk ─────────────
console.log('\n1) Future NOT_STARTED item, expected=0, actual=0 -> no risk');
{
  const project = v2Project({ constructionStartDate: TODAY.toISOString().slice(0, 10), constructionEndDate: isoInDays(300), targetOpeningDate: isoInDays(300) });
  const report = { id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10), workPackageStatuses: {}, photos: [], risks: [] };
  const result = orchestrate(project, [report]);
  check('progress is 0', result.progress.overallProgress === 0);
  check('readiness status is Ready (not Critical) despite many incomplete items', result.readiness.status === 'Ready');
  check('risk level is LOW', result.compatibility.legacyState.riskScore.level === 'LOW');
}

// ── 2 & 6. Many future opening requirements (incl. final-stage activities) ──
console.log('\n2&6) 25+ future opening requirements (Final Commissioning, Inspection, Snag Closure, etc.) early in a healthy project -> readiness remaining, zero risk');
{
  const project = v2Project({ constructionStartDate: isoDaysAgo(3), constructionEndDate: isoInDays(280), targetOpeningDate: isoInDays(280) });
  const report = {
    id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10),
    workPackageStatuses: { 'common.demolition': { 'Strip Out & Clear': { status: 'In Progress', progress: 20 } } },
    photos: [], risks: [],
  };
  const result = orchestrate(project, [report]);
  check('at least 25 mandatory items remain (readiness inventory is high)', result.readiness.blockerCount >= 25);
  check('named late-stage activities are present in the blocker inventory (Final Inspection, Snagging Closure, Final Commissioning)',
    ['Final Inspection', 'Snagging / Punch List Closure', 'Electrical Final Commissioning'].every(name =>
      result.readiness.criticalBlockers.some(b => b.task === name) || result.readiness.softBlockers.some(b => b.task === name)));
  check('readiness status is Ready despite the high remaining count', result.readiness.status === 'Ready');
  check('readiness verdict is READY_TRACK (ample slack)', result.readiness.verdict === 'READY_TRACK');
  check('risk level is LOW — zero risk despite 25+ incomplete future items', result.compatibility.legacyState.riskScore.level === 'LOW');
  check('risk score factors contain no blocker-count-based factor', !result.compatibility.legacyState.riskScore.factors.some(f => /blocker/i.test(f.name)));
}

// ── 3. NOT_STARTED but expected to have begun ───────────────────────────────
console.log('\n3) NOT_STARTED but expected progress materially > 0 -> risk/watch, not silently ignored');
{
  // Construction "started" 120 days ago out of a 200-day schedule (60% expected
  // elapsed), opening only 80 days out — but the project has NEVER reported any
  // progress at all -> a real, evidence-backed signal (unlike scenario 1/2,
  // where elapsed time is ~0 and silence is completely normal).
  const project = v1Project({ constructionStartDate: isoDaysAgo(120), constructionEndDate: isoInDays(80), targetOpeningDate: isoInDays(80) });
  const result = orchestrate(project, []); // zero reports submitted
  check('risk level escalates above LOW for a silent, overdue-feeling project', result.compatibility.legacyState.riskScore.level !== 'LOW');
  check('risk factors explain why (expected-progress-based, not blocker-based)',
    result.compatibility.legacyState.riskScore.factors.some(f => /expected progress/i.test(f.name) || /construction started/i.test(f.name)));
}

// ── 4. In-progress material delay: expected materially > actual -> risk ────
console.log('\n4) In-progress material delay (expected >> actual) -> real schedule risk');
{
  const project = v1Project({ constructionStartDate: isoDaysAgo(90), constructionEndDate: isoInDays(110), targetOpeningDate: isoInDays(110) });
  // ~45% expected by elapsed time; report shows only 5% actual progress.
  const report = {
    id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10),
    workPackageStatuses: { demolition: { 'Strip Out & Clear': { status: 'In Progress', progress: 10 }, 'Structural Demolition': { status: 'Not Started', progress: 0 } } },
    photos: [], risks: [],
  };
  const result = orchestrate(project, [report]);
  check('actual progress is materially below expected', result.progress.overallProgress < 20);
  check('risk level is elevated (MEDIUM or higher) for a real schedule deviation', ['MEDIUM', 'HIGH', 'CRITICAL'].includes(result.compatibility.legacyState.riskScore.level));
  check('Schedule deviation factor is present and explains the gap', result.compatibility.legacyState.riskScore.factors.some(f => f.name === 'Schedule deviation'));
}

// ── 5. Completed work -> no schedule risk from incompletion ─────────────────
console.log('\n5) Fully completed project (every v1 blocker WP Completed) -> no schedule risk');
{
  // All 14 v1 blocker WPs (constructionRetailV1.js), marked Completed —
  // mirrors openingReadinessEngine.test.mjs's ALL_OTHER_BLOCKERS_COMPLETED fixture.
  const wpStatuses = {
    testing: {
      'Electrical Testing': { status: 'Completed', progress: 100 },
      'HVAC Pressure Test': { status: 'Completed', progress: 100 },
      'Plumbing Pressure Test': { status: 'Completed', progress: 100 },
      'Fire System Hydraulic Test': { status: 'Completed', progress: 100 },
    },
    end_devices: {
      'Lighting Fixtures': { status: 'Completed', progress: 100 },
      'Sensors & Detectors': { status: 'Completed', progress: 100 },
      'Furniture & Fixtures': { status: 'Completed', progress: 100 },
    },
    commissioning: {
      'Full Systems Commissioning': { status: 'Completed', progress: 100 },
      'Snagging / Punch List': { status: 'Completed', progress: 100 },
    },
    pre_opening: {
      'Staff Training': { status: 'Completed', progress: 100 },
      'Deep Cleaning': { status: 'Completed', progress: 100 },
    },
    handover: {
      'Final Inspection': { status: 'Completed', progress: 100 },
      'Acceptance & Transfer': { status: 'Completed', progress: 100 },
      'Keys & Possession': { status: 'Completed', progress: 100 },
    },
  };
  const readiness = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, isoInDays(10));
  check('requiredDays is 0 with nothing left to close', readiness.requiredDays === 0);
  check('verdict is READY_TRACK even 10 days out with zero slack needed', readiness.verdict === 'READY_TRACK');
  check('status is Ready', readiness.status === 'Ready');
}

// ── 7. Existing explicit risk remains surfaced ──────────────────────────────
console.log('\n7) Explicit persisted report risk is not suppressed by this change');
{
  const project = v2Project({ constructionStartDate: isoDaysAgo(3), constructionEndDate: isoInDays(280), targetOpeningDate: isoInDays(280) });
  const report = {
    id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10),
    workPackageStatuses: { 'common.demolition': { 'Strip Out & Clear': { status: 'In Progress', progress: 20 } } },
    photos: [], risks: ['Coordination', 'Safety or External Factors'], riskOwners: ['General Contractor'], riskScale: 'High', riskDescription: 'Real reported risk.',
  };
  const result = orchestrate(project, [report]);
  check('a real reported High risk scale still contributes real points to the score', result.compatibility.legacyState.riskScore.score > 0);
  check('the "Risk scale" factor fires from the persisted report, unsuppressed by this change', result.compatibility.legacyState.riskScore.factors.some(f => f.name === 'Risk scale' && f.value === 'High'));
}

// ── 8. Dependency/feasibility-driven risk (critical-path signal) ───────────
console.log('\n8) Genuinely infeasible schedule (CPM close-out exceeds runway) -> real Critical, not suppressed');
{
  // Opening in 5 days, one report on file (so computeProjectRiskScore takes the
  // main scoring path, not the zero-reports fallback) but the full v1 blocker
  // chain (needs ~tens of days) cannot possibly close in time.
  const project = v1Project({ constructionStartDate: isoDaysAgo(200), constructionEndDate: isoInDays(5), targetOpeningDate: isoInDays(5) });
  const report = { id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10), workPackageStatuses: { demolition: { 'Strip Out & Clear': { status: 'Completed', progress: 100 } } }, photos: [], risks: [] };
  const result = orchestrate(project, [report]);
  check('readiness verdict is NOT_ACHIEVABLE — a genuine feasibility threat', result.readiness.verdict === 'NOT_ACHIEVABLE');
  check('readiness status correctly escalates to Critical', result.readiness.status === 'Critical');
  check('risk score picks up the "Opening not achievable" factor', result.compatibility.legacyState.riskScore.factors.some(f => f.name === 'Opening not achievable'));
  check('risk level is elevated for a genuinely infeasible schedule', result.compatibility.legacyState.riskScore.level !== 'LOW');
}

// ── 9. v1 project / phase model compatibility (already exercised above, explicit check) ──
console.log('\n9) v1 (legacy phase) project compatibility');
{
  const project = v1Project({ constructionStartDate: isoDaysAgo(3), constructionEndDate: isoInDays(280), targetOpeningDate: isoInDays(280) });
  const report = { id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10), workPackageStatuses: {}, photos: [], risks: [] };
  const result = orchestrate(project, [report]);
  check('v1 project also gets Ready status with ample slack', result.readiness.status === 'Ready');
  check('v1 project also has zero risk', result.compatibility.legacyState.riskScore.level === 'LOW');
}

// ── 10. v2 zoned project compatibility (explicit, mirrors bug report exactly) ──
console.log('\n10) v2 zoned project compatibility — exact bug-report reproduction');
{
  const project = v2Project({ constructionStartDate: isoDaysAgo(1), constructionEndDate: isoInDays(300), targetOpeningDate: isoInDays(300) });
  const report = { id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10), workPackageStatuses: {}, photos: [], risks: [] };
  const result = orchestrate(project, [report]);
  check('v2 project: many mandatory items remain (matches "23 critical + 5 soft" report)', result.readiness.criticalBlockers.length >= 20 && result.readiness.softBlockers.length >= 1);
  check('v2 project: NO mass critical-risk classification', result.readiness.status !== 'Critical' && result.readiness.status !== 'At Risk');
  check('v2 project: risk level stays LOW', result.compatibility.legacyState.riskScore.level === 'LOW');
}

// ── 11. Weekly Report consumer reflects the corrected output ───────────────
console.log('\n11) Weekly Report export model reflects corrected readiness, not the old false positive');
{
  const project = v2Project({ constructionStartDate: isoDaysAgo(1), constructionEndDate: isoInDays(300), targetOpeningDate: isoInDays(300) });
  const report = { id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10), workPackageStatuses: {}, photos: [], risks: [] };
  const canonicalResult = orchestrate(project, [report]);
  const model = buildWeeklyReportExportModel({ project, report, projectReports: [report], canonicalResult, overallProgress: canonicalResult.progress.overallProgress, generatedAt: TODAY.toISOString() });
  check('model.health.readinessStatus is Ready, not Critical', model.health.readinessStatus === 'Ready');
  check('model.health.riskLevel is LOW', model.health.riskLevel === 'LOW');
  check('model.readiness still lists the remaining requirements (readiness inventory preserved)', model.readiness.criticalBlockers.length >= 20);
}

// ── 12. PDF export consumes the corrected result (no template-side risk logic) ──
console.log('\n12) PDF export renders the corrected readiness/risk output verbatim');
{
  const project = v2Project({ constructionStartDate: isoDaysAgo(1), constructionEndDate: isoInDays(300), targetOpeningDate: isoInDays(300) });
  const report = { id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10), workPackageStatuses: {}, photos: [], risks: [] };
  const canonicalResult = orchestrate(project, [report]);
  const model = buildWeeklyReportExportModel({ project, report, projectReports: [report], canonicalResult, overallProgress: canonicalResult.progress.overallProgress, generatedAt: TODAY.toISOString() });
  const stream = await pdf(WeeklyReportPdfTemplate(model, [])).toBuffer();
  const chunks = []; for await (const c of stream) chunks.push(c);
  const buf = Buffer.concat(chunks);
  check('PDF renders successfully', buf.slice(0, 5).toString('latin1') === '%PDF-');
  check('model fed to the PDF already carries the corrected Ready status (no PDF-side risk recalculation exists)', model.health.readinessStatus === 'Ready');
}

// ── 13. No accidental change in canonical progress calculation ─────────────
console.log('\n13) Canonical progress calculation is unaffected by this change');
{
  const project = v1Project({ constructionStartDate: isoDaysAgo(90), constructionEndDate: isoInDays(110), targetOpeningDate: isoInDays(110) });
  const report = {
    id: 'r1', reportingDate: TODAY.toISOString().slice(0, 10),
    workPackageStatuses: { demolition: { 'Strip Out & Clear': { status: 'Completed', progress: 100 }, 'Structural Demolition': { status: 'In Progress', progress: 50 } } },
    photos: [], risks: [],
  };
  const result = orchestrate(project, [report]);
  check('progress is the deterministic weighted mean, unrelated to readiness/risk changes', result.progress.overallProgress === 75);
}

// ── 14. No accidental change in readiness remaining counts ─────────────────
console.log('\n14) Readiness remaining-item counts (blockerCount/criticalBlockers/softBlockers) are byte-identical to before this fix');
{
  // v1 full template: 12 critical + 2 soft blockers when nothing is reported (documented, pre-existing count).
  const readiness = computeOpeningReadiness({ workPackageStatuses: {} }, isoInDays(30));
  check('critical blocker count unchanged (12, from constructionRetailV1)', readiness.criticalBlockers.length === 12);
  check('soft blocker count unchanged (2, from constructionRetailV1)', readiness.softBlockers.length === 2);
  check('blockerCount is the sum, unchanged formula', readiness.blockerCount === readiness.criticalBlockers.length + readiness.softBlockers.length);
}

// ── Explicit regression fixture: the exact reported bug ─────────────────────
console.log('\nREGRESSION — newly-created project, first Weekly Report, large number of future NOT_STARTED opening requirements => NO mass critical-risk classification');
{
  const project = v2Project({
    storeCode: 'REG-01',
    constructionStartDate: isoDaysAgo(2),
    constructionEndDate: isoInDays(75), // a realistic, aggressive-but-plausible near-term opening
    targetOpeningDate: isoInDays(75),
  });
  const firstReport = {
    id: 'first-report',
    reportingDate: TODAY.toISOString().slice(0, 10),
    submittedAt: TODAY.toISOString().slice(0, 10),
    workPackageStatuses: { 'common.demolition': { 'Strip Out & Clear': { status: 'In Progress', progress: 15 } } },
    photos: [], risks: [],
  };
  const result = orchestrate(project, [firstReport]);
  check('reproduction: 20+ mandatory items remain (this IS what triggered the original bug)', result.readiness.criticalBlockers.length >= 20);
  check('reproduction: readiness status is NOT Critical', result.readiness.status !== 'Critical');
  check('reproduction: readiness status is NOT At Risk either — genuinely healthy, ample slack', result.readiness.status === 'Ready');
  check('reproduction: risk level is LOW (no mass critical-risk classification)', result.compatibility.legacyState.riskScore.level === 'LOW');
  check('reproduction: risk score has no factor derived from blocker/readiness count', !result.compatibility.legacyState.riskScore.factors.some(f => /blocker/i.test(f.name) || /critical.*remaining/i.test(f.name)));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
