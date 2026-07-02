// riskEngine.test.mjs — AD-013 characterization tests.
// Goal: lock current behavior as a regression net before AD-004 refactor.
// Uses the extensionless-import loader (same pattern as src/tests/riskEngine.test.mjs).
// DO NOT change engine logic if a test exposes a bug — report it instead.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const {
  getRiskLevel,
  computeScheduleDeviation,
  computeTrend,
  computeProjectRiskScore,
} = await import('./riskEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// ── A) getRiskLevel ───────────────────────────────────────────────────────────
// Thresholds: >= 81 CRITICAL, >= 61 HIGH, >= 31 MEDIUM, else LOW.

console.log('\nA) getRiskLevel boundaries');

check('A1: 81 → CRITICAL',  getRiskLevel(81)  === 'CRITICAL');
check('A2: 80 → HIGH',      getRiskLevel(80)  === 'HIGH');
check('A3: 61 → HIGH',      getRiskLevel(61)  === 'HIGH');
check('A4: 60 → MEDIUM',    getRiskLevel(60)  === 'MEDIUM');
check('A5: 31 → MEDIUM',    getRiskLevel(31)  === 'MEDIUM');
check('A6: 30 → LOW',       getRiskLevel(30)  === 'LOW');
check('A7: 0  → LOW',       getRiskLevel(0)   === 'LOW');

// ── B) computeScheduleDeviation ───────────────────────────────────────────────

console.log('\nB) computeScheduleDeviation');

// B1–B3: null guards
check('B1: no start → null',
  computeScheduleDeviation({ constructionEndDate: iso(now + 100 * DAY) }, 50) === null);
check('B2: no end and no targetOpeningDate → null',
  computeScheduleDeviation({ constructionStartDate: iso(now - 100 * DAY) }, 50) === null);
check('B3: end <= start → null',
  computeScheduleDeviation({
    constructionStartDate: iso(now),
    constructionEndDate:   iso(now - DAY),
  }, 50) === null);

// B4: return shape — every documented field present
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    constructionEndDate:   iso(now + 100 * DAY),
    targetOpeningDate:     iso(now + 100 * DAY),
  }, 20);
  check('B4: shape — expectedPct present',       r !== null && 'expectedPct'       in r);
  check('B4: shape — actualPct present',         r !== null && 'actualPct'         in r);
  check('B4: shape — deviationPct present',      r !== null && 'deviationPct'      in r);
  check('B4: shape — predictedDelayDays present',r !== null && 'predictedDelayDays' in r);
  check('B4: shape — totalDays present',         r !== null && 'totalDays'         in r);
  check('B4: shape — elapsedDays present',       r !== null && 'elapsedDays'       in r);
  check('B4: actualPct === progress arg',        r !== null && r.actualPct === 20);
}

// B5: deviationPct = max(0, expectedPct - progress) — never negative
{
  const ahead = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    constructionEndDate:   iso(now + 100 * DAY),
  }, 90);
  check('B5: progress ahead → deviationPct=0 (max floor)',
    ahead !== null && ahead.deviationPct === 0);
}

// B6: expectedPct capped at 100 when elapsed > total
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 200 * DAY),
    constructionEndDate:   iso(now - 100 * DAY),
  }, 50);
  check('B6: elapsed > total → expectedPct=100', r !== null && r.expectedPct === 100);
}

// B7: predictedDelayDays === 0 when progress >= 100
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 100 * DAY),
    constructionEndDate:   iso(now + 100 * DAY),
  }, 100);
  check('B7: progress=100 → predictedDelayDays=0', r !== null && r.predictedDelayDays === 0);
}

// B8: targetOpeningDate used as fallback when constructionEndDate absent
{
  const r = computeScheduleDeviation({
    constructionStartDate: iso(now - 50 * DAY),
    targetOpeningDate:     iso(now + 50 * DAY),
  }, 30);
  check('B8: targetOpeningDate fallback → non-null', r !== null);
  check('B8: fallback totalDays ≈ 100', r !== null && r.totalDays >= 99 && r.totalDays <= 101);
}

// ── C) computeTrend ───────────────────────────────────────────────────────────

console.log('\nC) computeTrend');

// C1: fewer than 2 reports → "Insufficient data", avgDiff = 0
{
  const r0 = computeTrend([]);
  check('C1a: [] → Insufficient data', r0.trend === 'Insufficient data');
  check('C1b: [] → avgDiff = 0',       r0.avgDiff === 0);

  const r1 = computeTrend([{ workPackageStatuses: {}, reportingDate: iso(now) }]);
  check('C1c: 1 report → Insufficient data', r1.trend === 'Insufficient data');
  check('C1d: 1 report → avgDiff = 0',       r1.avgDiff === 0);
}

// C2: "Improving" — 0% → 100% jump in rough_in (avgDiff >= 5)
{
  const r1 = { workPackageStatuses: {}, reportingDate: iso(now - 7 * DAY) };
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
  check('C2: improving series → "Improving"', r.trend === 'Improving');
  check('C2: avgDiff >= 5',                   r.avgDiff >= 5);
}

// C3: flat-zero → avgDiff = 0 → "Stalling"
{
  const flat = (daysAgo) => ({ workPackageStatuses: {}, reportingDate: iso(now - daysAgo * DAY) });
  const r = computeTrend([flat(14), flat(7), flat(0)]);
  check('C3: flat-zero avgDiff = 0', r.avgDiff === 0);
  check('C3: flat-zero → Stalling', r.trend === 'Stalling');
}

// ── D) computeProjectRiskScore — smoke tests ───────────────────────────────────

console.log('\nD) computeProjectRiskScore — smoke tests');

// Fixtures: use far-future opening date to avoid opening-proximity points.
const PROJ_BASE = {
  constructionStartDate: iso(now - 5 * DAY),
  constructionEndDate:   iso(now + 500 * DAY),
  targetOpeningDate:     iso(now + 500 * DAY),
};

// D1: zero-reports path → computeNoReportsRisk
{
  const r = computeProjectRiskScore(PROJ_BASE, [], 0, []);
  check('D1: zero-reports — score is number',    typeof r.score === 'number');
  check('D1: zero-reports — score in [0,100]',   r.score >= 0 && r.score <= 100);
  check('D1: zero-reports — score >= base(20)',  r.score >= 20);
  check('D1: zero-reports — level is string',    typeof r.level === 'string');
  check('D1: zero-reports — factors is Array',   Array.isArray(r.factors));
  check('D1: zero-reports — reasons is Array',   Array.isArray(r.reasons));
  check('D1: zero-reports — "No reports submitted" factor present',
    r.factors.some(f => f.name === 'No reports submitted'));
}

// D2: normal project, fresh benign report → shape + score in range
// riskScale='Medium'(12pts) only meaningful factor; all others 0.
// Expected total: 12 → level=LOW
{
  const report = {
    reportingDate:          iso(now - 2 * DAY),
    projectScheduleStatus:  'On Track',
    riskScale:              'Medium',
    activitiesBlocked:      'No',
    risks:                  [],
    supportRequired:        'No',
  };
  const r = computeProjectRiskScore(PROJ_BASE, [report], 5, []);
  check('D2: normal — score is number',           typeof r.score === 'number');
  check('D2: normal — score in [0,100]',          r.score >= 0 && r.score <= 100);
  check('D2: normal — level valid',               ['CRITICAL','HIGH','MEDIUM','LOW'].includes(r.level));
  check('D2: normal — factors is Array',          Array.isArray(r.factors));
  check('D2: normal — rootCause is Array',        Array.isArray(r.rootCause));
  check('D2: normal — reasons is Array',          Array.isArray(r.reasons));
  check('D2: normal — factors each have {name,value,pts}',
    r.factors.every(f => 'name' in f && 'value' in f && typeof f.pts === 'number'));
  check('D2: benign project → LOW risk',          r.level === 'LOW');
  check('D2: benign score = 12 (Medium riskScale only)', r.score === 12);
}

// D3: score clamped to 100 — pile on maximum-risk factors
{
  const highRiskReport = {
    reportingDate:         iso(now - 35 * DAY),   // staleness > 30d (+15)
    projectScheduleStatus: 'Delayed',
    riskScale:             'High',                 // +20
    activitiesBlocked:     'Yes',                 // +15
    risks:                 ['a','b','c','d'],      // 4 items, 4*2.5=10 capped at 10
    supportRequired:       'Yes',                 // +5
  };
  const highRiskProject = {
    constructionStartDate: iso(now - 300 * DAY),
    constructionEndDate:   iso(now + 10 * DAY),   // opening in 10d (< 21) → +15
    targetOpeningDate:     iso(now + 10 * DAY),
  };
  const r = computeProjectRiskScore(highRiskProject, [highRiskReport], 10, []);
  check('D3: high-risk project — score <= 100 (clamped)', r.score <= 100);
  check('D3: high-risk project — CRITICAL or HIGH level', ['CRITICAL','HIGH'].includes(r.level));
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
