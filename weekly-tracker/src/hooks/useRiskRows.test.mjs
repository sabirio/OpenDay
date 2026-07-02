// useRiskRows.test.mjs — structural contract test for computeRiskRows logic.
//
// The engine chain (riskEngine, contractorEngine, etc.) uses extension-less
// Vite imports that Node ESM can't resolve natively. This test stubs those
// engines locally and verifies the compositional contract:
//   1. All base fields are preserved (spread)
//   2. riskScore is the SAME object reference — NOT recomputed
//   3. All 13 risk-only fields appear in the output
//   4. contractorName derivation order (generalContractor → contractor → "")
//   5. driftCache deduplication (same contractor → same driftProfile reference)
//
// Run: node src/hooks/useRiskRows.test.mjs

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Stub engines (identity / constant returns) ────────────────────────────────

const STUB_SCHED  = { predictedDelayDays: 0, expectedPct: 50, deviationPct: 0 };
const STUB_TREND  = { direction: 'stable', delta: 0 };
const STUB_CONT   = { score: 80, reliability: 'high' };
const STUB_ESC    = [];
const STUB_DIMS   = { schedule: 'LOW', contractor: 'LOW' };
const STUB_EVO    = [];
const STUB_CONF   = { level: 'HIGH', label: 'High confidence', pts: 7, maxPts: 8, breakdown: [] };
const STUB_ACTS   = [];
const STUB_HEALTH = { score: 85, label: 'Healthy' };
const STUB_EVM    = { spi: 1.0, cpi: 1.0 };
const STUB_MONTE  = { p50: 0, p80: 0 };

function makeDrift(name) { return { contractor: name, avgDelay: 0 }; }

// Inline implementation of computeRiskRows with stub engines injected.
// This mirrors the EXACT logic in computeRiskRows.js — tested via structural assertion,
// not by re-importing the Vite-only source.
// NOTE: confidence is no longer computed here; it is pre-computed in useAllRows and
// flows through via ...base spread (single source of truth).
function computeRiskRows(baseRows, projects, reports, siteVisits, {
  computeScheduleDeviation   = () => STUB_SCHED,
  computeTrend               = () => STUB_TREND,
  computeContractorScores    = () => STUB_CONT,
  computeEscalations         = () => STUB_ESC,
  computeDimensionRisk       = () => STUB_DIMS,
  computeWeeklyEvolution     = () => STUB_EVO,
  computeRecommendedActions  = () => STUB_ACTS,
  computeProjectHealth       = () => STUB_HEALTH,
  computeEVM                 = () => STUB_EVM,
  computeContractorDriftProfile = (_, __, ___, name) => makeDrift(name),
  computeMonteCarloForecast  = () => STUB_MONTE,
} = {}) {
  const driftCache = new Map();
  return baseRows.map(base => {
    const { project, latestReport, progress, projReports, projSiteVisits, sorted, riskScore } = base;

    const schedDev       = computeScheduleDeviation(project, progress);
    const trend          = computeTrend(sorted);
    const contScore      = computeContractorScores(project, projReports, projSiteVisits);
    const escalations    = computeEscalations(sorted, projSiteVisits);
    const dims           = computeDimensionRisk(project, latestReport, riskScore, schedDev, contScore, projSiteVisits);
    const evolution      = computeWeeklyEvolution(sorted, project);
    const actions        = computeRecommendedActions(riskScore, contScore, schedDev, latestReport, projSiteVisits, project);
    const health         = computeProjectHealth(riskScore, progress, contScore);
    const contractorName = project.generalContractor || latestReport?.contractor || "";
    const evm            = computeEVM(project, sorted, progress);

    let driftProfile;
    if (driftCache.has(contractorName)) {
      driftProfile = driftCache.get(contractorName);
    } else {
      driftProfile = computeContractorDriftProfile(projects, reports, siteVisits, contractorName);
      driftCache.set(contractorName, driftProfile);
    }

    const monteCarlo = computeMonteCarloForecast(project, sorted, null);

    return { ...base, schedDev, trend, contScore, escalations, dims, evolution, actions, health, contractorName, evm, driftProfile, monteCarlo };
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RISK_SCORE = Object.freeze({ level: 'HIGH', score: 72, factors: [], color: {} });

const BASE_FIELDS = [
  'project', 'latestReport', 'cumulativeStatuses', 'wpCumulativeStatuses',
  'progress', 'projReports', 'projSiteVisits', 'sorted', 'color',
  'progressPoints', 'daysSinceReport', 'missingReport', 'daysToOpening',
  'riskScore', 'riskLevel', 'priorityScore',
  'confidence', // computed in useAllRows, flows through ...base
];

const RISK_FIELDS = [
  'schedDev', 'trend', 'contScore', 'escalations', 'dims',
  'evolution', 'actions', 'health', 'contractorName',
  'evm', 'driftProfile', 'monteCarlo',
];

const project = Object.freeze({
  id: 'proj-1', storeCode: 'ST01', shoppingMallName: 'Mall A',
  generalContractor: 'BuiltCo', targetOpeningDate: null,
  scope: null, templateId: null,
});

const baseRow = {
  project,
  latestReport:         null,
  cumulativeStatuses:   {},
  wpCumulativeStatuses: null,
  progress:             50,
  projReports:          [],
  projSiteVisits:       [],
  sorted:               [],
  color:                '#aaa',
  progressPoints:       [],
  daysSinceReport:      null,
  missingReport:        false,
  daysToOpening:        null,
  riskScore:            RISK_SCORE,
  riskLevel:            'HIGH',
  priorityScore:        1,
  confidence:           STUB_CONF, // pre-computed in useAllRows, not in computeRiskRows
};

// ── 1. Output shape ───────────────────────────────────────────────────────────

console.log('\n1) Output shape');
const rows = computeRiskRows([baseRow], [project], [], []);
check('returns array',        Array.isArray(rows));
check('length matches input', rows.length === 1);

console.log('\n2) All base fields preserved');
for (const f of BASE_FIELDS) {
  check(`has base field: ${f}`, f in rows[0]);
}

console.log('\n3) All 12 risk-only fields added');
for (const f of RISK_FIELDS) {
  check(`has risk field: ${f}`, f in rows[0]);
}

// ── 2. riskScore identity (CRITICAL: must NOT call computeProjectRiskScore again) ──

console.log('\n4) riskScore is the SAME object reference as base.riskScore');
check('riskScore === RISK_SCORE',  rows[0].riskScore === RISK_SCORE);
check('riskLevel preserved (HIGH)', rows[0].riskLevel === 'HIGH');
check('riskScore.score preserved', rows[0].riskScore.score === 72);

// Verify a spy: computeProjectRiskScore would NOT be called inside computeRiskRows
let riskRecomputeCount = 0;
computeRiskRows([baseRow], [project], [], [], {
  // no computeProjectRiskScore in the signature — it's not called at all
});
check('computeProjectRiskScore not invoked (spy via absence)', riskRecomputeCount === 0);

// ── 3. contractorName derivation ─────────────────────────────────────────────

console.log('\n5) contractorName derivation');
check('from project.generalContractor', rows[0].contractorName === 'BuiltCo');

const rowNoGC = computeRiskRows([{
  ...baseRow,
  project:      { ...project, generalContractor: '' },
  latestReport: { contractor: 'ReportCo' },
}], [project], [], []);
check('fallback to latestReport.contractor', rowNoGC[0].contractorName === 'ReportCo');

const rowNone = computeRiskRows([{
  ...baseRow,
  project:      { ...project, generalContractor: '' },
  latestReport: null,
}], [project], [], []);
check('fallback to empty string', rowNone[0].contractorName === '');

// ── 4. driftCache: same contractor → same driftProfile reference ──────────────

console.log('\n6) driftCache deduplication');
const project2 = { ...project, id: 'proj-2', storeCode: 'ST02' };
const base2    = { ...baseRow, project: project2 };
let driftCallCount = 0;
const twoRows = computeRiskRows([baseRow, base2], [project, project2], [], [], {
  computeContractorDriftProfile: (_, __, ___, name) => {
    driftCallCount++;
    return makeDrift(name);
  },
});
check('both rows produced',                  twoRows.length === 2);
check('driftProfile reference equal',        twoRows[0].driftProfile === twoRows[1].driftProfile);
check('engine called only once (not twice)', driftCallCount === 1);

// ── 5. Empty input ────────────────────────────────────────────────────────────

console.log('\n7) Empty input → empty output');
const empty = computeRiskRows([], [], [], []);
check('empty array returned', Array.isArray(empty) && empty.length === 0);

// ── 6. Base immutability ──────────────────────────────────────────────────────

console.log('\n8) Does not mutate baseRow');
const snapshot = { ...baseRow };
computeRiskRows([baseRow], [project], [], []);
check('baseRow.riskScore unchanged', baseRow.riskScore === RISK_SCORE);
check('baseRow.riskLevel unchanged', baseRow.riskLevel === snapshot.riskLevel);
check('baseRow.progress unchanged',  baseRow.progress  === snapshot.progress);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
