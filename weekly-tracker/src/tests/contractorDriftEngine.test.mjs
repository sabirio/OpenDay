// contractorDriftEngine.test.mjs — zero-dependency smoke tests.
// Run: node src/tests/contractorDriftEngine.test.mjs
//
// Same data: URL loader as riskEngine / evmEngine tests — appends '.js' to
// extensionless relative specifiers so Node 22 ESM can load Vite-style imports.
// contractorDriftEngine.js → pmAlignmentEngine → workPackages/reportUtils all use
// extensionless imports, so the loader is required for the full chain.
//
// GC report / PM visit shape (legacy column format — pmAlignmentEngine falls back
// automatically when workPackageStatuses / pmWorkPackageStatuses are absent):
//   gcReport: { projectId, reportingDate (ISO), demolitionStatus, constructionStatuses:{},
//               testingStatuses:{}, handoverStatuses:{} }
//   pmVisit:  { projectId, visitDate (ISO), demolitionStatus, constructionStatuses:{},
//               testingStatuses:{}, handoverStatuses:{} }
//
// Status scores (WP_STATUS_SCORES in workPackages.js):
//   Completed = 1.0, In Progress = 0.5, Delayed = 0.3, Not Started = 0
//   diff = gcScore - pmScore (positive = GC overstates PM)
//   Completed vs In Progress → diff = 1.0 - 0.5 = 0.5
//   Completed vs Completed   → diff = 0
//
// projectId on reports/visits must match String(project.id) — the profile engine
// filters with String(r.projectId) === String(project.id).
//
// TODO: add WP-format (workPackageStatuses / pmWorkPackageStatuses) tests once the
// WP column set in workPackages.js is confirmed stable.
// TODO: computeDriftTimeline with multiple visits across a longer timeline.
// Not wired into runTests.js (that runner imports named exports from .js files).

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeDriftTimeline, computeDriftPattern, computeContractorDriftProfile } =
  await import('../engines/contractorDriftEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// Shared: empty legacy status maps so only demolitionStatus is compared per fixture
const EMPTY_STS = { constructionStatuses: {}, testingStatuses: {}, handoverStatuses: {} };

// ── A) computeDriftPattern — fully pure, no IO needed ─────────────────────────
// Branch order inside engine: systematic → panic → front_loading → accurate.
// Each fixture is designed so ONLY the intended branch fires (see guard analysis).
console.log('\nA) computeDriftPattern — all branches');

// A1: empty input → early return (accurate/low/Insufficient data)
{
  const r = computeDriftPattern([]);
  check('A1: [] → pattern=accurate',           r.pattern         === 'accurate');
  check('A1: [] → confidence=low',             r.confidence      === 'low');
  check('A1: [] → "Insufficient data"',        r.description     === 'Insufficient data');
  check('A1: [] → avgOverallDrift=0',          r.avgOverallDrift === 0);
}

// A2/A3: single element → length < 2 guard
{
  const r = computeDriftPattern([{ avgDiff: 0.3 }]);
  check('A2: 1pt → confidence=low',             r.confidence    === 'low');
  check('A2: 1pt → "Only one data point"',      r.description.includes('one data point'));
  // avgOverallDrift = Math.round(0.3*100)/100 = 0.3
  check('A3: 1pt → avgOverallDrift=0.3 (2dp)',  r.avgOverallDrift === 0.3);
}

// A4: systematic_overstatement — 4 pts all avgDiff=0.3
//   avgOverallDrift=0.3>0.15 ✓  |  overRatio=4/4=1.0>=0.7 ✓  |  length>=4 → high
{
  const pts4 = [0.3, 0.3, 0.3, 0.3].map(v => ({ avgDiff: v }));
  const r = computeDriftPattern(pts4);
  check('A4: 4×0.3 → systematic_overstatement',   r.pattern    === 'systematic_overstatement');
  check('A4: length>=4 → confidence=high',         r.confidence === 'high');
}

// A5: systematic_overstatement — 3 pts → confidence=medium (length < 4)
{
  const pts3 = [0.3, 0.3, 0.3].map(v => ({ avgDiff: v }));
  check('A5: 3×0.3 → systematic/medium', computeDriftPattern(pts3).confidence === 'medium');
}

// A6/A7: panic_report — [0.5, 0.5, 0.05]
//   avgOverallDrift = (0.5+0.5+0.05)/3 = 0.35 > 0.15, BUT overRatio = 2/3 = 0.667 < 0.7 → NOT systematic
//   i=2: prev=driftTimeline[1].avgDiff=0.5 > 0.15, drop=0.5-0.05=0.45 > 0.4 → panic fires ✓
{
  const panic = [0.5, 0.5, 0.05].map(v => ({ avgDiff: v }));
  const r = computeDriftPattern(panic);
  check('A6: [0.5,0.5,0.05] → panic_report',          r.pattern    === 'panic_report');
  check('A6: panic_report → confidence=medium',        r.confidence === 'medium');
  check('A7: panic description mentions sudden drop',  r.description.toLowerCase().includes('drop') ||
                                                       r.description.toLowerCase().includes('sudden'));
}

// A8/A9: front_loading — [0.25, 0.25, 0.05, 0.05]
//   avgOverallDrift = 0.6/4 = 0.15 NOT > 0.15 → NOT systematic
//   Max drop = 0.25-0.05 = 0.20 NOT > 0.4 → NOT panic
//   half=2, firstAvg=0.25 > 0.2 ✓, secondAvg=0.05 < 0.25-0.15=0.10 ✓ → front_loading fires
{
  const front = [0.25, 0.25, 0.05, 0.05].map(v => ({ avgDiff: v }));
  const r = computeDriftPattern(front);
  check('A8: [0.25,0.25,0.05,0.05] → front_loading',   r.pattern    === 'front_loading');
  check('A8: front_loading → confidence=medium',        r.confidence === 'medium');
  check('A9: front_loading description mentions early', r.description.toLowerCase().includes('early'));
}

// A10/A11: accurate fallthrough — no earlier branch fires
//   length >= 3 → high; length = 2 → medium
{
  const r3 = computeDriftPattern([0, 0, 0].map(v => ({ avgDiff: v })));
  check('A10: 3 zero pts → accurate',          r3.pattern    === 'accurate');
  check('A10: 3 pts → confidence=high',        r3.confidence === 'high');

  const r2 = computeDriftPattern([0, 0].map(v => ({ avgDiff: v })));
  check('A11: 2 zero pts → accurate',          r2.pattern    === 'accurate');
  check('A11: 2 pts → confidence=medium',      r2.confidence === 'medium');
}

// A12: avgOverallDrift is rounded to 2 decimal places
//   (0.123 + 0.456) / 2 = 0.2895 → Math.round(28.95)/100 = 29/100 = 0.29
{
  const r = computeDriftPattern([{ avgDiff: 0.123 }, { avgDiff: 0.456 }]);
  check('A12: avgOverallDrift rounded 2dp — 0.2895 → 0.29', r.avgOverallDrift === 0.29);
}

// ── B) computeDriftTimeline ────────────────────────────────────────────────────
console.log('\nB) computeDriftTimeline');

// B1/B2: empty or undefined siteVisits → []
check('B1: empty siteVisits → []',     computeDriftTimeline([], []).length         === 0);
check('B2: undefined siteVisits → []', computeDriftTimeline([], undefined).length  === 0);

// B3: GC report dated AFTER the visit → no prior report found → zero drift point
{
  const gcFuture = { reportingDate: iso(now + DAY), demolitionStatus: 'Completed', ...EMPTY_STS };
  const visitNow = { visitDate: iso(now) };
  const tl = computeDriftTimeline([gcFuture], [visitNow]);
  check('B3: GC after visit → driftScore=0', tl[0].driftScore === 0);
  check('B3: GC after visit → itemCount=0',  tl[0].itemCount  === 0);
  check('B3: GC after visit → avgDiff=0',    tl[0].avgDiff    === 0);
}

// B4: out-of-order visits are sorted by visitDate; week indices reflect sorted position
{
  const vNewer = { visitDate: iso(now) };
  const vOlder = { visitDate: iso(now - 7 * DAY) };
  const tl = computeDriftTimeline([], [vNewer, vOlder]);  // pass newer first (wrong order)
  check('B4: visits sorted → entry[0] date is the older visit', tl[0].date === vOlder.visitDate);
  check('B4: week indices assigned after sort → [1, 2]',        tl[0].week === 1 && tl[1].week === 2);
}

// B5: visit with matching prior GC report → real driftScore/itemCount/avgDiff
//   gcReport filed 7d before visit; legacy format, only demolitionStatus compared.
//   gcScore=Completed(1.0), pmScore=In Progress(0.5) → diff=0.5
//   driftScore=0.5, itemCount=1, avgDiff=0.5 (all rounded: Math.round(0.5*100)/100=0.5)
{
  const gc = { reportingDate: iso(now - 7 * DAY), demolitionStatus: 'Completed',   ...EMPTY_STS };
  const pv = { visitDate: iso(now),               demolitionStatus: 'In Progress', ...EMPTY_STS };
  const tl = computeDriftTimeline([gc], [pv]);
  check('B5: with matching GC → driftScore=0.5', tl[0].driftScore === 0.5);
  check('B5: with matching GC → itemCount=1',    tl[0].itemCount  === 1);
  check('B5: with matching GC → avgDiff=0.5',    tl[0].avgDiff    === 0.5);
  check('B5: single visit → week=1',             tl[0].week       === 1);
}

// ── C) computeContractorDriftProfile ──────────────────────────────────────────
console.log('\nC) computeContractorDriftProfile');

// C1/C2: falsy contractorName → null immediately
check('C1: empty-string name → null', computeContractorDriftProfile([], [], [], '')   === null);
check('C2: null name → null',         computeContractorDriftProfile([], [], [], null) === null);

// C3: no projects match the contractor → zero-project defaults
{
  const r = computeContractorDriftProfile([{ generalContractor: 'OtherCo' }], [], [], 'ACME');
  check('C3: no projects → projectCount=0',             r.projectCount     === 0);
  check('C3: no projects → reliabilityScore=100',       r.reliabilityScore === 100);
  check('C3: no projects → correctionFactor=1',         r.correctionFactor === 1);
  check('C3: no projects → pattern "No projects found"',r.pattern.description === 'No projects found');
}

// C4: one project with a real drift point
//   gc: Completed(1.0) vs pm: In Progress(0.5) → diff=0.5 → avgHistoricalDrift=0.5
//   reliabilityScore = round(max(0, min(100, 100 - |0.5|*200))) = round(0) = 0
//   correctionFactor = round((1+0.5)*100)/100 = 1.5
//   pattern = computeDriftPattern([{avgDiff:0.5}]) → 1 point → "Only one data point available"
{
  const p1 = { id: 'p1', generalContractor: 'ACME', storeCode: 'S1' };
  const gc  = { projectId: 'p1', reportingDate: iso(now - 7 * DAY), demolitionStatus: 'Completed',   ...EMPTY_STS };
  const pv  = { projectId: 'p1', visitDate:     iso(now),           demolitionStatus: 'In Progress', ...EMPTY_STS };
  const r   = computeContractorDriftProfile([p1], [gc], [pv], 'ACME');
  check('C4: avgHistoricalDrift=0.5',     r.avgHistoricalDrift === 0.5);
  check('C4: reliabilityScore=0',         r.reliabilityScore   === 0);
  check('C4: correctionFactor=1.5',       r.correctionFactor   === 1.5);
  check('C4: worstProject.storeCode=S1',  r.worstProject?.storeCode === 'S1');
}

// C5: two projects — worstProject is the one with higher absolute avgDrift
//   p1: Completed vs In Progress → avgDrift=0.5
//   p2: Completed vs Completed  → diff=0, avgDrift=0
//   worstProject = p1 (|0.5| > |0|)
{
  const p1  = { id: '1', generalContractor: 'ACME', storeCode: 'S1' };
  const p2  = { id: '2', generalContractor: 'ACME', storeCode: 'S2' };
  const gc1 = { projectId: '1', reportingDate: iso(now-7*DAY), demolitionStatus: 'Completed',   ...EMPTY_STS };
  const gc2 = { projectId: '2', reportingDate: iso(now-7*DAY), demolitionStatus: 'Completed',   ...EMPTY_STS };
  const pv1 = { projectId: '1', visitDate:     iso(now),       demolitionStatus: 'In Progress', ...EMPTY_STS };
  const pv2 = { projectId: '2', visitDate:     iso(now),       demolitionStatus: 'Completed',   ...EMPTY_STS };
  const r   = computeContractorDriftProfile([p1, p2], [gc1, gc2], [pv1, pv2], 'ACME');
  check('C5: two projects → projectCount=2',                    r.projectCount           === 2);
  check('C5: worstProject is S1 (higher |avgDrift|=0.5 vs 0)', r.worstProject?.storeCode === 'S1');
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
