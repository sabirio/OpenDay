// contractorEngine.test.mjs — zero-dependency unit tests.
// Run: node src/tests/contractorEngine.test.mjs
//
// Tests:
//   A) Empty reports guard — early-return defaults
//   B) Reporting discipline — gap penalties and 8-point cap
//   C) PM alignment — no-visit baseline, schedule mismatch, CRITICAL item
//   D) Contractor-controlled progress — null schedDev, dev=0 (future project)
//   E) Issue management — blocker counts, risks-without-mitigation
//   F) Communication quality — all four penalties fire → 0
//   G) Score aggregation — totalScore, performanceScore, pmAlignmentScore
//   H) Portfolio grouping — multi-contractor averaging, sorting, label assignment, fallbacks
//
// NOT wired into runTests.js — run separately.
//
// ─── Key fixture values (fully verified analytically) ─────────────────────────
// B1: [R_OLD(now-30d), R_BARREN(now)] → 20-6(gap>21d)-4(no look-ahead)-3(risks)-3(no photos)=4
// B2: [R_50D, R_25D, R_GOOD] → two 25d gaps → raw=12, cap=8 → 20-8=12
// C3: PM=Delayed (severe) + GC=On Track → pmBadV&&gcGoodV&&pmSevere → -7 → 30-7=23
// C6: Completed(1.0) vs Not Started(0) → diff=1.0 → CRITICAL → -4 → 30-4=26
// C7: PM=Critical + GC=At Risk → pmSevere&&gcAtRiskV → -3 → 30-3=27
// D2: future project → elapsedDays=0 → expectedPct=0 → dev=0 → progressPts=25
// E1: 2 blocked(-3) + 1 risk-no-desc(-2) → 15-3-2=10
// E2: ≥3 blocked(-6) → 15-6=9
// G:  [R_OLD, R_BARREN] / P_NODATES / no visits: rep=4, pm=25, prog=15, iss=13, comm=2
//     totalScore=59, performanceScore=round(34/70*100)=49, pmAlignmentScore=round(25/30*100)=83
// H:  ACME(2 rows: perf=70, acc=80, total=75) vs BuildCo(1 row: total=45) → BuildCo first

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeContractorScores, computePortfolioContractorScores } =
  await import('../engines/contractorEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// ── Projects ──────────────────────────────────────────────────────────────────
const P_NODATES = {};  // no constructionStartDate → schedDev=null → progressPts=15
const P_FUTURE  = {   // not yet started → elapsedDays=max(0,-10)=0 → expectedPct=0 → dev=0 → 25
  constructionStartDate: iso(now + 10 * DAY),
  constructionEndDate:   iso(now + 110 * DAY),
};

// ── Reports ───────────────────────────────────────────────────────────────────
const R_SIMPLE = { reportingDate: iso(now - 7 * DAY) };  // minimal, no WP or status data

// For B1: 30d gap + all reporting penalties. Also used in G.
const R_OLD    = { reportingDate: iso(now - 30 * DAY) };
const R_BARREN = {
  reportingDate: iso(now),
  risks: ['flood risk'],  // truthy array, no riskDescription → reporting -3, issues risksWithoutMit+1
};

// For B2: two 25d gaps exceed the 8-point cap
const R_50D  = { reportingDate: iso(now - 50 * DAY) };
const R_25D  = { reportingDate: iso(now - 25 * DAY) };
const R_GOOD = {
  reportingDate: iso(now),
  nextWeekTop3: 'Plastering, MEP, tiling',  // satisfies look-ahead check
  photos:       ['site-photo.jpg'],           // satisfies photos check
};

// For C: GC report with various schedule statuses
const R_GC_ONTRACK = { reportingDate: iso(now - 7 * DAY), projectScheduleStatus: 'On Track' };
const R_GC_ATRISK  = { reportingDate: iso(now - 7 * DAY), projectScheduleStatus: 'At Risk' };
const R_GC_ITEM    = {
  reportingDate:         iso(now - 7 * DAY),
  projectScheduleStatus: 'On Track',
  demolitionStatus:      'Completed',  // score=1.0; vs Not Started(0) → diff=1.0 → CRITICAL
};

// ── Site visits ───────────────────────────────────────────────────────────────
const V_DELAYED  = { visitDate: iso(now), pmScheduleAssessment: 'Delayed'  };  // isSevereScheduleStatus=true
const V_CRITICAL = { visitDate: iso(now), pmScheduleAssessment: 'Critical' };  // isSevereScheduleStatus=true
const V_ITEM     = { visitDate: iso(now), pmScheduleAssessment: 'On Track', demolitionStatus: 'Not Started' };

// ── A) Empty reports guard ────────────────────────────────────────────────────
console.log('\nA) Empty reports guard');
{
  const r = computeContractorScores({}, [], []);
  check('A1: totalScore=50',               r.totalScore            === 50);
  check('A2: performanceScore=50',         r.performanceScore      === 50);
  check('A3: pmAlignmentScore=50',         r.pmAlignmentScore      === 50);
  check('A4: breakdown.reporting=10',      r.breakdown.reporting   === 10);
  check('A5: breakdown.pmAlignment=15',    r.breakdown.pmAlignment === 15);
  check('A6: breakdown.progress=12',       r.breakdown.progress    === 12);
  check('A7: breakdown.issues=8',          r.breakdown.issues      === 8);
  check('A8: breakdown.communication=5',   r.breakdown.communication === 5);
  check('A9: pmAlignmentDetails = []',
    Array.isArray(r.pmAlignmentDetails) && r.pmAlignmentDetails.length === 0);
}

// ── B) Reporting discipline ───────────────────────────────────────────────────
console.log('\nB) Reporting discipline');
{
  // R_OLD → R_BARREN: gap=30d(>21→+6, cap min(8,6)=6) + no look-ahead(-4) + risks(-3) + no photos(-3) = 4
  const r = computeContractorScores(P_NODATES, [R_OLD, R_BARREN], []);
  check('B1: 30d gap + all penalties → reporting=4', r.breakdown.reporting === 4);
}
{
  // R_50D→R_25D: gap=25d(+6); R_25D→R_GOOD: gap=25d(+6); raw=12 → capped to 8 → 20-8=12.
  // R_GOOD has look-ahead+photos → no other penalties.
  const r = computeContractorScores(P_NODATES, [R_50D, R_25D, R_GOOD], []);
  check('B2: 2×25d gaps capped at 8 → reporting=12', r.breakdown.reporting === 12);
}

// ── C) PM alignment ──────────────────────────────────────────────────────────
console.log('\nC) PM alignment');
{
  // No visits → pmAlignmentPts stays at baseline 25
  const r = computeContractorScores(P_NODATES, [R_SIMPLE], []);
  check('C1: no visits → pmAlignment=25',      r.breakdown.pmAlignment === 25);
  check('C2: no visits → pmAlignmentScore=83', r.pmAlignmentScore       === 83);
}
{
  // PM=Delayed (isSevereScheduleStatus=true) + GC=On Track → pmBadV&&gcGoodV&&pmSevere → -7 → 23
  const r = computeContractorScores(P_NODATES, [R_GC_ONTRACK], [V_DELAYED]);
  check('C3: PM=Delayed, GC=On Track → pmAlignment=23',  r.breakdown.pmAlignment === 23);
  check('C4: → pmAlignmentScore=77',                     r.pmAlignmentScore       === 77);
  check('C5: → pmAlignmentDetails.length=1',             r.pmAlignmentDetails.length === 1);
}
{
  // CRITICAL alignment item: Completed(1.0) vs Not Started(0) → diff=1.0>0.75 → CRITICAL → -4 → 26
  // PM=On Track (not bad) → no schedule mismatch penalty
  const r = computeContractorScores(P_NODATES, [R_GC_ITEM], [V_ITEM]);
  check('C6: CRITICAL item (Completed vs Not Started) → pmAlignment=26', r.breakdown.pmAlignment === 26);
}
{
  // PM=Critical (severe) + GC=At Risk → isSevereScheduleStatus&&gcAtRiskV → -3 → 27
  // (gcGoodV='At Risk'==='On Track'=false → falls to else if branch)
  const r = computeContractorScores(P_NODATES, [R_GC_ATRISK], [V_CRITICAL]);
  check('C7: PM=Critical, GC=At Risk → pmAlignment=27', r.breakdown.pmAlignment === 27);
}

// ── D) Contractor-controlled progress ─────────────────────────────────────────
console.log('\nD) Progress');
{
  // No project dates → computeScheduleDeviation returns null → progressPts=15
  const r = computeContractorScores(P_NODATES, [R_SIMPLE], []);
  check('D1: no project dates → progress=15', r.breakdown.progress === 15);
}
{
  // Future project: start=now+10d → elapsedDays=max(0,ceil(-10))=0 → expectedPct=0
  // gcProgress=0 (no WP data) → deviationPct=max(0,0-0)=0 → progressPts=25
  const r = computeContractorScores(P_FUTURE, [R_SIMPLE], []);
  check('D2: future project → dev=0 → progress=25', r.breakdown.progress === 25);
}
{
  // D3: engine-audit regression (2026-07-16) — gcProgress used to be computed
  // with no scopeWPIds/template at all, so a project's scope narrowing was
  // silently ignored. The report covers two phases: 'demo.strip_out'
  // (phaseWeight 0.08, Completed) and 'walls.marking' (phaseWeight 0.20 via
  // rough_in, Not Started). Scoped to just the completed WP, only that
  // phase counts (unreported phases are excluded, not zeroed) → progress=100%
  // → dev=0 → progressPts=25. Unscoped, both reported phases count and
  // rough_in's 0% (larger weight) pulls the weighted average well below 100%.
  const P_MID = { constructionStartDate: iso(now - 50 * DAY), constructionEndDate: iso(now + 50 * DAY) };
  const R_WP = {
    reportingDate: iso(now),
    workPackageStatuses: {
      demolition: { 'Strip Out & Clear': { status: 'Completed', progress: 100 } },
      rough_in:   { 'Wall Marking & Setting Out': { status: 'Not Started', progress: 0 } },
    },
  };
  const scoped   = computeContractorScores({ ...P_MID, scope: { workPackages: ['demo.strip_out'] } }, [R_WP], []);
  const unscoped = computeContractorScores(P_MID, [R_WP], []);
  check('D3: scoped to the completed WP → progress=25 (dev=0)', scoped.breakdown.progress === 25);
  check('D3: unscoped → same report yields a lower progressPts (scope was not ignored)',
    unscoped.breakdown.progress < scoped.breakdown.progress);
}

// ── E) Issue management ───────────────────────────────────────────────────────
console.log('\nE) Issue management');
{
  // 2 blocked (≥2 → -3) + 1 risk-without-description (-2×1=2, cap5) → 15-3-2=10
  const reps = [
    { reportingDate: iso(now - 14 * DAY), activitiesBlocked: 'Yes' },
    { reportingDate: iso(now - 7 * DAY),  activitiesBlocked: 'Yes' },
    { reportingDate: iso(now),             risks: ['site flood'] },  // no riskDescription
  ];
  const r = computeContractorScores(P_NODATES, reps, []);
  check('E1: 2 blocked + 1 risk-no-desc → issues=10', r.breakdown.issues === 10);
}
{
  // ≥3 blocked → -6 → 15-6=9
  const reps = [
    { reportingDate: iso(now - 21 * DAY), activitiesBlocked: 'Yes' },
    { reportingDate: iso(now - 14 * DAY), activitiesBlocked: 'Yes' },
    { reportingDate: iso(now -  7 * DAY), activitiesBlocked: 'Yes' },
  ];
  const r = computeContractorScores(P_NODATES, reps, []);
  check('E2: ≥3 blocked → issues=9', r.breakdown.issues === 9);
}

// ── F) Communication quality ──────────────────────────────────────────────────
// All four comm penalties: -4(no look-ahead) -2(no finalComments) -2(supportRequired) -2(no photos) = 0
console.log('\nF) Communication quality');
{
  const barren = {
    reportingDate:   iso(now),
    supportRequired: 'Yes',  // no supportDescription, no supportTypes → fires penalty
    // no nextWeekTop3/lookAheadNotes, no finalComments/pendingIssues, no photos
  };
  const r = computeContractorScores(P_NODATES, [barren], []);
  check('F1: all comm penalties → communication=0', r.breakdown.communication === 0);
}

// ── G) Score aggregation ──────────────────────────────────────────────────────
// [R_OLD, R_BARREN] / P_NODATES / no visits:
//   rep=4, pm=25, prog=15(no dates), iss=13(1 risk-no-desc), comm=2
//   totalScore = min(100, 4+25+15+13+2) = 59
//   performanceScore = min(100, round((4+15+13+2)/70*100)) = round(48.57) = 49
//   pmAlignmentScore = min(100, round(25/30*100)) = round(83.33) = 83
console.log('\nG) Score aggregation');
{
  const r = computeContractorScores(P_NODATES, [R_OLD, R_BARREN], []);
  check('G1: totalScore=59',       r.totalScore       === 59);
  check('G2: performanceScore=49', r.performanceScore === 49);
  check('G3: pmAlignmentScore=83', r.pmAlignmentScore === 83);
}

// ── H) Portfolio contractor scores ────────────────────────────────────────────
// computePortfolioContractorScores groups by generalContractor, averages, labels, sorts ascending.
console.log('\nH) Portfolio contractor scores');
{
  const mkRow = (gc, storeCode, perf, pmScore, total, nReports) => ({
    project:      { generalContractor: gc, storeCode },
    contScore:    { performanceScore: perf, pmAlignmentScore: pmScore, totalScore: total },
    projReports:  { length: nReports },  // engine only reads .length for reportCount
    latestReport: null,
  });

  // ACME: 2 rows → avgPerf=round(140/2)=70, avgAcc=round(160/2)=80, avgTotal=round(150/2)=75
  //   perfLevel='Moderate' (70≥60, <80)  accLevel='Accurate' (80≥80)
  //   reportCount=5+3=8
  // BuildCo: 1 row → avgPerf=50, avgAcc=40, avgTotal=45
  //   perfLevel='Needs Attention' (<60)  accLevel='Unreliable' (<60)
  // Sort ascending by avgTotal: BuildCo(45) → [0],  ACME(75) → [1]
  const rows = [
    mkRow('ACME',    'S1', 80, 90, 85, 5),
    mkRow('ACME',    'S2', 60, 70, 65, 3),
    mkRow('BuildCo', 'S3', 50, 40, 45, 2),
  ];
  const result = computePortfolioContractorScores(rows);

  check('H1: length=2',                             result.length === 2);
  check('H2: sorted ascending → [0]=BuildCo',      result[0].name === 'BuildCo');
  check('H3: ACME at [1]',                          result[1].name === 'ACME');
  check('H4: ACME n=2',                             result[1].n           === 2);
  check('H5: ACME avgPerf=70',                      result[1].avgPerf     === 70);
  check('H6: ACME avgAccuracy=80',                  result[1].avgAccuracy === 80);
  check('H7: ACME avgTotal=75',                     result[1].avgTotal    === 75);
  check('H8: ACME reportCount=8',                   result[1].reportCount === 8);
  check('H9: ACME perfLevel=Moderate',              result[1].perfLevel   === 'Moderate');
  check('H10: ACME accLevel=Accurate',              result[1].accLevel    === 'Accurate');
  check('H11: ACME perfColor=var(--status-warn)',   result[1].perfColor   === 'var(--status-warn)');
  check('H12: BuildCo perfLevel=Needs Attention',   result[0].perfLevel   === 'Needs Attention');
  check('H13: BuildCo accLevel=Unreliable',         result[0].accLevel    === 'Unreliable');
}
{
  // Fallback: null generalContractor + null latestReport → "Unknown"
  const r = computePortfolioContractorScores([{
    project:      { storeCode: 'S99' },
    contScore:    { performanceScore: 70, pmAlignmentScore: 70, totalScore: 70 },
    projReports:  { length: 1 },
    latestReport: null,
  }]);
  check('H14: null gc → "Unknown"', r[0].name === 'Unknown');
}
{
  // Fallback: latestReport.contractor used when generalContractor is absent
  const r = computePortfolioContractorScores([{
    project:      { storeCode: 'S99' },
    contScore:    { performanceScore: 70, pmAlignmentScore: 70, totalScore: 70 },
    projReports:  { length: 1 },
    latestReport: { contractor: 'VendorX' },
  }]);
  check('H15: latestReport.contractor fallback → "VendorX"', r[0].name === 'VendorX');
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
