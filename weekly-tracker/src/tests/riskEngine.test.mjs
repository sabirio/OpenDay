// riskEngine.test.mjs — zero-dependency smoke tests. Run: node src/tests/riskEngine.test.mjs
//
// NOTE: riskEngine.js uses Vite-style extensionless imports (e.g. '../utils/reportUtils')
// which Node ESM rejects. We register a one-liner loader via node:module register() that
// appends '.js' to relative specifiers lacking an extension — no npm dependency needed.
// This file is self-contained and is NOT wired into runTests.js (which ingests .js named-
// export files). Keep running it separately: node src/tests/riskEngine.test.mjs
//
// TODO (later batches — need projReports+siteVisits+contScore fixtures):
//   - computeProjectRiskScore
//   - computeWeeklyEvolution
// computeDimensionRisk: only its PM_MISMATCH_FACTOR_NAMES branch is covered
// below (engine-audit regression, 2026-07-16) — not exhaustive.

import { register } from 'node:module';

// Loader: append '.js' to relative specifiers that have no file extension.
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

// Dynamic import AFTER loader is registered — applies the hook above.
const { getRiskLevel, computeScheduleDeviation, computeTrend, computeDimensionRisk, PM_MISMATCH_FACTOR_NAMES } =
  await import('../engines/riskEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// ── A) getRiskLevel ────────────────────────────────────────────────────────────
// Thresholds: >=81 CRITICAL, >=61 HIGH, >=31 MEDIUM, else LOW.

console.log('\nA) getRiskLevel — boundary values');
check('100 → CRITICAL',  getRiskLevel(100) === 'CRITICAL');
check('81  → CRITICAL',  getRiskLevel(81)  === 'CRITICAL');
check('80  → HIGH',      getRiskLevel(80)  === 'HIGH');
check('61  → HIGH',      getRiskLevel(61)  === 'HIGH');
check('60  → MEDIUM',    getRiskLevel(60)  === 'MEDIUM');
check('31  → MEDIUM',    getRiskLevel(31)  === 'MEDIUM');
check('30  → LOW',       getRiskLevel(30)  === 'LOW');
check('0   → LOW',       getRiskLevel(0)   === 'LOW');
// Negative scores: the >= chain never fires → falls through to LOW (documented behavior).
check('-5  → LOW (negative score falls through)', getRiskLevel(-5) === 'LOW');

// ── B) computeScheduleDeviation ───────────────────────────────────────────────
// All dates computed relative to `now` so the tests don't rot.

console.log('\nB) computeScheduleDeviation — boundary values');

// B1: missing constructionStartDate → null
check('B1: missing start → null',
  computeScheduleDeviation({ constructionEndDate: iso(now + 100 * DAY) }, 50) === null);

// B2: missing end and no targetOpeningDate → null
check('B2: missing end + no targetOpeningDate → null',
  computeScheduleDeviation({ constructionStartDate: iso(now - 100 * DAY) }, 50) === null);

// B3: end <= start → null
check('B3: end < start → null',
  computeScheduleDeviation({
    constructionStartDate: iso(now),
    constructionEndDate:   iso(now - DAY),
  }, 50) === null);

// B4: normal project, progress behind schedule
// start = 100d ago, end = 100d from now → totalDays ≈ 200, elapsedDays ≈ 100, expectedPct ≈ 50
// progress = 10 → deviationPct = max(0, 50-10) = 40 > 0 → predictedDelayDays > 0
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    constructionEndDate:   iso(now + 100 * DAY),
  }, 10);
  check('B4: non-null',                   r !== null);
  check('B4: deviationPct > 0',           r !== null && r.deviationPct > 0);
  check('B4: predictedDelayDays > 0',     r !== null && r.predictedDelayDays > 0);
  check('B4: actualPct = 10',             r !== null && r.actualPct === 10);
}

// B5: progress = 100 → predictedDelayDays = 0 (guard: `progress < 100` in engine)
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    constructionEndDate:   iso(now + 100 * DAY),
  }, 100);
  check('B5: progress=100 → predictedDelayDays=0', r !== null && r.predictedDelayDays === 0);
}

// B6: progress ahead of schedule → deviationPct = 0 (Math.max(0,...) floor)
// start=100d ago, end=100d from now → expectedPct ≈ 50; actual 80 → ahead
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    constructionEndDate:   iso(now + 100 * DAY),
  }, 80);
  check('B6: progress ahead → deviationPct=0', r !== null && r.deviationPct === 0);
}

// B7: elapsed > totalDays → expectedPct clamped to 100
// start=200d ago, end=100d ago → totalDays=100, elapsedDays=200 → min(100, 200) = 100
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 200 * DAY),
    constructionEndDate:   iso(now - 100 * DAY),
  }, 50);
  check('B7: elapsed>total → expectedPct=100', r !== null && r.expectedPct === 100);
}

// B8: targetOpeningDate used as fallback end when constructionEndDate is absent
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    targetOpeningDate:     iso(now + 100 * DAY),
  }, 10);
  check('B8: targetOpeningDate fallback → non-null', r !== null);
}

// ── C) computeTrend ───────────────────────────────────────────────────────────
// computeTrend(sortedReports) internally calls computeWPCumulativeStatuses +
// calculateProjectProgressResult. We test via observable output, not mocks.
//
// Report shape required: { workPackageStatuses: {...}, reportingDate: isoString }
// workPackageStatuses: { phaseId → { taskLabel → { progress: 0-100, status } } }
// An empty `{}` is a valid WP report (isWPReport checks != null, not length).

console.log('\nC) computeTrend — guards + behavioral sequences');

// C1: empty array → early return "Insufficient data"
{
  const r = computeTrend([]);
  check('C1: [] → "Insufficient data"', r.trend === 'Insufficient data');
  check('C1: [] → avgDiff = 0',         r.avgDiff === 0);
}

// C2: single-element array → early return "Insufficient data"
{
  const r = computeTrend([{ workPackageStatuses: {}, reportingDate: iso(now) }]);
  check('C2: 1 report → "Insufficient data"', r.trend === 'Insufficient data');
}

// C3: "Improving" — rough_in phase moves from 0% (no data) to 100% (all tasks done).
// rough_in has progressWeight=22 in constructionRetailV1. With only rough_in in the
// cumulative merge, calculateProjectProgress returns 100 (denominator = rough_in weight only).
// points=[0,100], avgDiff=100 ≥ 5 → "Improving".
// Task labels are the exact strings from masterTaskLibrary.js WORK_PACKAGES.
{
  const r1 = {
    workPackageStatuses: {},                    // no entries → progress = 0
    reportingDate: iso(now - 7 * DAY),
  };
  const r2 = {
    workPackageStatuses: {
      rough_in: {
        'Wall Marking & Setting Out': { progress: 100, status: 'Completed' },
        'Wall Framing / Partitions':  { progress: 100, status: 'Completed' },
        'Electrical Rough-In':        { progress: 100, status: 'Completed' },
        'HVAC Ductwork':              { progress: 100, status: 'Completed' },
        'Plumbing Rough-In':          { progress: 100, status: 'Completed' },
        'Fire Protection Rough-In':   { progress: 100, status: 'Completed' },
      },
    },
    reportingDate: iso(now),
  };
  const r = computeTrend([r1, r2]);
  check('C3: "Improving" trend detected', r.trend === 'Improving');
  check('C3: avgDiff ≥ 5',               r.avgDiff >= 5);
}

// C4: flat-zero sequence — both reports have empty workPackageStatuses.
// Cumulative max stays {} → progress=0 for both slices → diffs=[0] → avgDiff=0 → "Stalling".
{
  const r1 = { workPackageStatuses: {}, reportingDate: iso(now - 14 * DAY) };
  const r2 = { workPackageStatuses: {}, reportingDate: iso(now -  7 * DAY) };
  const r = computeTrend([r1, r2]);
  check('C4: flat-zero → avgDiff ≤ 0',
    r.avgDiff <= 0);
  check('C4: flat-zero → Stalling or Deteriorating',
    ['Stalling', 'Deteriorating'].includes(r.trend));
}

// ── D) computeProjectRiskScore — EVM SPI completion guard ─────────────────────

const { computeProjectRiskScore } = await import('../engines/riskEngine.js');

console.log('\nD) computeProjectRiskScore — progress=100 skips EVM SPI factor');

// D1: progress=100 with a project that is well behind schedule (start 200d ago, end 100d ago).
// Without the guard, SPI = 100/100 = 1.0 (ok) but with progress=30 it would fire.
// More importantly: with progress=100 the "EVM SPI critical" factor must NEVER appear,
// even if the project date window gives pv > 0.
{
  const project100 = {
    id: 'test-complete',
    constructionStartDate: iso(now - 200 * DAY),
    targetOpeningDate:     iso(now - 100 * DAY),  // overdue project, but complete
    projectStatus: 'Active',
    projectType: 'Standard',
  };
  const minimalReport = {
    projectScheduleStatus: 'On Track',
    supportRequired: 'No',
    activitiesBlocked: 'No',
    reportingDate: iso(now - 7 * DAY),
    risks: [], riskOwners: [],
  };
  const result100 = computeProjectRiskScore(project100, [minimalReport], 100, []);
  const hasEVMFactor = (result100.factors || []).some(f => f.name === 'EVM SPI critical');
  check('D1: progress=100 → no EVM SPI critical factor', !hasEVMFactor);
}

// D2: same project with progress=30 → EVM SPI critical factor IS present (guard works both ways)
{
  const project30 = {
    id: 'test-behind',
    constructionStartDate: iso(now - 200 * DAY),
    targetOpeningDate:     iso(now + 50 * DAY),
    projectStatus: 'Active',
    projectType: 'Standard',
  };
  const minimalReport = {
    projectScheduleStatus: 'On Track',
    supportRequired: 'No',
    activitiesBlocked: 'No',
    reportingDate: iso(now - 7 * DAY),
    risks: [], riskOwners: [],
  };
  const result30 = computeProjectRiskScore(project30, [minimalReport], 30, []);
  const hasEVMFactor = (result30.factors || []).some(f => f.name === 'EVM SPI critical');
  check('D2: progress=30 on overdue project → EVM SPI critical factor present', hasEVMFactor);
}

// ── E) computeProjectRiskScore — "Opening not achievable" (A3) reads readiness.verdict ──
console.log('\nE) computeProjectRiskScore — Opening not achievable factor (A3)');

{
  const project = {
    id: 'test-readiness',
    constructionStartDate: iso(now - 100 * DAY),
    targetOpeningDate:     iso(now + 10 * DAY),
    projectStatus: 'Active',
    projectType: 'Standard',
  };
  const minimalReport = {
    projectScheduleStatus: 'On Track',
    supportRequired: 'No',
    activitiesBlocked: 'No',
    reportingDate: iso(now - 7 * DAY),
    risks: [], riskOwners: [],
  };

  const notAchievable = computeProjectRiskScore(project, [minimalReport], 60, [], { verdict: 'NOT_ACHIEVABLE', requiredDays: 19.5, slack: -9.5 });
  const withFactor = (notAchievable.factors || []).find(f => f.name === 'Opening not achievable');
  check('E1: NOT_ACHIEVABLE verdict adds the factor', !!withFactor);
  check('E2: factor value names the deficit', withFactor && /short by 10d/.test(withFactor.value));
  check('E3: factor is categorized under Opening', notAchievable.rootCause.some(rc => rc.cat === 'Opening'));

  const readyTrack = computeProjectRiskScore(project, [minimalReport], 60, [], { verdict: 'READY_TRACK', requiredDays: 5, slack: 20 });
  const noFactor = (readyTrack.factors || []).some(f => f.name === 'Opening not achievable');
  check('E4: READY_TRACK verdict does not add the factor', !noFactor);

  const noReadinessArg = computeProjectRiskScore(project, [minimalReport], 60, []);
  const noFactorEither = (noReadinessArg.factors || []).some(f => f.name === 'Opening not achievable');
  check('E5: omitting readiness entirely is safe (defaults to null, no crash, no factor)', !noFactorEither);
}

// ── F) computeDimensionRisk — PM Alignment via PM_MISMATCH_FACTOR_NAMES ────────
// Engine-audit regression (2026-07-16): computeDimensionRisk's "PM Alignment"
// bump only checked 2 of the 3 real factor names computeProjectRiskScore can
// push, so a project whose ONLY PM-mismatch factor was "Severity gap (PM vs
// GC)" showed "LOW" PM Alignment on RiskDashboard's dimension matrix despite
// riskScore.rootCause correctly attributing points to PM Alignment.

console.log('\nF) computeDimensionRisk — PM Alignment dimension via PM_MISMATCH_FACTOR_NAMES');
{
  const project = {};
  const latestReport = {};
  const projSiteVisits = [{ id: 'visit-1' }]; // only needs length > 0 to enter the branch

  for (const name of PM_MISMATCH_FACTOR_NAMES) {
    const riskScore = { score: 30, factors: [{ name, pts: 5, value: 'test' }] };
    const dims = computeDimensionRisk(project, latestReport, riskScore, null, null, projSiteVisits);
    check(`"${name}" alone bumps PM Alignment above LOW`, dims['PM Alignment'] !== 'LOW');
  }

  const noMismatch = { score: 0, factors: [{ name: 'Report staleness', pts: 5, value: 'test' }] };
  const dimsNoMismatch = computeDimensionRisk(project, latestReport, noMismatch, null, null, projSiteVisits);
  check('an unrelated factor does not bump PM Alignment', dimsNoMismatch['PM Alignment'] === 'LOW');
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
