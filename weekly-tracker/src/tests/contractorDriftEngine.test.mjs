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

const { computeDriftTimeline, computeDriftPattern, computeContractorDriftProfile,
        computeBiasEwma, computeAdjustedProgress, computeDriftRiskFactor, computeDriftConfidenceFactor,
        formatDriftPct, formatAbsDriftPct, driftMagnitude, DRIFT_SIGNIFICANCE_THRESHOLD } =
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
  check('C3: no projects → biasEwma=0',                 r.biasEwma         === 0);
  check('C3: no projects → sampleCount=0',               r.sampleCount      === 0);
  check('C3: no projects → confidenceFactor=0',          r.confidenceFactor === 0);
  check('C3: no projects → reliable=false',              r.reliable         === false);
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
  check('C4: sampleCount=1 (single visit)',   r.sampleCount === 1);
  check('C4: biasEwma=avgDiff of the 1 pt',   r.biasEwma    === 0.5);
  check('C4: n=1 → reliable=false',           r.reliable    === false);
  check('C4: confidenceFactor=1/5=0.2',       r.confidenceFactor === 0.2);
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
  // Both visits land on the same date, so the chronological sort in
  // computeContractorDriftProfile is stable and keeps project concat order:
  // [p1 pt (avgDiff=0.5), p2 pt (avgDiff=0)] → ewma = 0.3*0 + 0.7*0.5 = 0.35
  check('C5: sampleCount=2 (one visit per project)',      r.sampleCount === 2);
  check('C5: biasEwma=0.35 (EWMA across both projects)',  r.biasEwma    === 0.35);
  check('C5: n=2 → still not reliable',                   r.reliable    === false);
}

// C6: three-plus samples with a real chronological order → reliable=true and
// biasEwma reflects recency-weighting (last, most-recent point dominates).
{
  const p1 = { id: '1', generalContractor: 'ACME', storeCode: 'S1' };
  const gc = { projectId: '1', reportingDate: iso(now - 40 * DAY), demolitionStatus: 'Completed', ...EMPTY_STS };
  // Three visits, oldest→newest, each compared against the same GC report
  const r = computeContractorDriftProfile([p1], [gc], [
    { projectId: '1', visitDate: iso(now - 20 * DAY), demolitionStatus: 'In Progress', ...EMPTY_STS }, // diff=0.5
    { projectId: '1', visitDate: iso(now - 10 * DAY), demolitionStatus: 'In Progress', ...EMPTY_STS }, // diff=0.5
    { projectId: '1', visitDate: iso(now),             demolitionStatus: 'Not Started', ...EMPTY_STS }, // diff=1.0
  ], 'ACME');
  check('C6: sampleCount=3',        r.sampleCount === 3);
  check('C6: n=3 → reliable=true',  r.reliable    === true);
  check('C6: confidenceFactor=0.6', r.confidenceFactor === 0.6);
  // ewma0=0.5; ewma1=0.3*0.5+0.7*0.5=0.5; ewma2=0.3*1.0+0.7*0.5=0.65
  check('C6: biasEwma=0.65 (recent 1.0 diff pulls EWMA up)', r.biasEwma === 0.65);
}

// ── D) computeBiasEwma ─────────────────────────────────────────────────────────
console.log('\nD) computeBiasEwma');

check('D1: empty timeline → biasEwma=0, sampleCount=0',
  computeBiasEwma([]).biasEwma === 0 && computeBiasEwma([]).sampleCount === 0);
check('D2: null timeline → biasEwma=0, sampleCount=0',
  computeBiasEwma(null).biasEwma === 0 && computeBiasEwma(null).sampleCount === 0);

{
  // Single point → seeds ewma directly, no smoothing applied yet
  const r = computeBiasEwma([{ avgDiff: 0.4 }]);
  check('D3: 1 pt → biasEwma=avgDiff (0.4)', r.biasEwma === 0.4);
  check('D3: 1 pt → sampleCount=1',          r.sampleCount === 1);
}

{
  // Constant series → ewma converges to the constant regardless of alpha
  const r = computeBiasEwma([{ avgDiff: 0.2 }, { avgDiff: 0.2 }, { avgDiff: 0.2 }]);
  check('D4: constant 0.2 series → biasEwma=0.2', r.biasEwma === 0.2);
}

{
  // Default alpha=0.3: ewma0=0.1; ewma1=0.3*0.5+0.7*0.1=0.22
  const r = computeBiasEwma([{ avgDiff: 0.1 }, { avgDiff: 0.5 }]);
  check('D5: default alpha=0.3 recurrence', r.biasEwma === 0.22);
}

{
  // Custom alpha=0.5: ewma0=0.1; ewma1=0.5*0.5+0.5*0.1=0.3
  const r = computeBiasEwma([{ avgDiff: 0.1 }, { avgDiff: 0.5 }], 0.5);
  check('D6: custom alpha=0.5 recurrence', r.biasEwma === 0.3);
}

// ── E) computeAdjustedProgress ──────────────────────────────────────────────────
console.log('\nE) computeAdjustedProgress');

check('E1: sampleCount=0 → unchanged',  computeAdjustedProgress(70, 0.2, 0) === 70);
check('E2: sampleCount=2 (<3) → unchanged', computeAdjustedProgress(70, 0.2, 2) === 70);

{
  // n=3 → confidenceFactor=min(1,3/5)=0.6; adjusted = 70 - (0.2*100)*0.6 = 70-12=58
  check('E3: n=3, bias=+0.2 → 70 adjusted to 58', computeAdjustedProgress(70, 0.2, 3) === 58);
}

{
  // n=5 → confidenceFactor=1; adjusted = 70 - 20*1 = 50
  check('E4: n=5, bias=+0.2 → 70 adjusted to 50', computeAdjustedProgress(70, 0.2, 5) === 50);
}

{
  // n=10 → confidenceFactor capped at 1 (min(1, 10/5)=1, not 2)
  check('E5: n=10 → confidenceFactor capped at 1', computeAdjustedProgress(70, 0.2, 10) === 50);
}

check('E6: clamps to 0 floor', computeAdjustedProgress(5, 0.5, 5) === 0);
check('E7: clamps to 100 ceiling (negative bias = understatement)', computeAdjustedProgress(98, -0.5, 5) === 100);

// ── E2) computeDriftConfidenceFactor — engine-audit fix (2026-07-16) ───────────
// Single shared formula now backing both computeAdjustedProgress() (internal
// use) and computeContractorDriftProfile()'s own returned confidenceFactor
// field — previously two independent copies of Math.min(1, sampleCount/5).
console.log('\nE2) computeDriftConfidenceFactor — shared formula');
check('n=0 → 0',           computeDriftConfidenceFactor(0)  === 0);
check('n=3 → 0.6',         computeDriftConfidenceFactor(3)  === 0.6);
check('n=5 → 1 (full)',    computeDriftConfidenceFactor(5)  === 1);
check('n=10 → capped at 1', computeDriftConfidenceFactor(10) === 1);

// ── F) computeDriftRiskFactor ────────────────────────────────────────────────────
console.log('\nF) computeDriftRiskFactor');

check('F1: null driftProfile → null',              computeDriftRiskFactor(null) === null);
check('F2: reliable=false → null (n<3 gate)',
  computeDriftRiskFactor({ reliable: false, biasEwma: 0.5, sampleCount: 1 }) === null);
check('F3: reliable but below threshold (5% < 8%) → null',
  computeDriftRiskFactor({ reliable: true, biasEwma: 0.05, sampleCount: 4 }) === null);

{
  // biasEwma=0.10 → 10% >= thresholdPct 8 → fires with configured pts
  const f = computeDriftRiskFactor({ reliable: true, biasEwma: 0.10, sampleCount: 4, contractorName: 'ACME' });
  check('F4: at/above threshold → fires',        f !== null);
  check('F4: pts matches RISK_WEIGHTS.systematicOverstatement.pts (12)', f.pts === 12);
  check('F4: value mentions contractor name and %', f.value.includes('ACME') && f.value.includes('10%'));
  check('F4: value mentions sample count',       f.value.includes('n=4'));
}

{
  // no contractorName → falls back to generic "Contractor" label
  const f = computeDriftRiskFactor({ reliable: true, biasEwma: 0.10, sampleCount: 4 });
  check('F5: missing contractorName → falls back to "Contractor"', f.value.startsWith('Contractor '));
}

console.log('\nG) Display formatting — formatDriftPct / formatAbsDriftPct / driftMagnitude');
{
  check('formatDriftPct(0.12) = 12', formatDriftPct(0.12) === 12);
  check('formatDriftPct(-0.08) = -8', formatDriftPct(-0.08) === -8);
  check('formatDriftPct(null) = 0', formatDriftPct(null) === 0);
  check('formatAbsDriftPct(-0.08) = 8', formatAbsDriftPct(-0.08) === 8);
  check('driftMagnitude(-0.08) = 0.08 (within float tolerance)', Math.abs(driftMagnitude(-0.08) - 0.08) < 1e-9);
  check('driftMagnitude(null) = 0', driftMagnitude(null) === 0);
  check('DRIFT_SIGNIFICANCE_THRESHOLD = 0.05', DRIFT_SIGNIFICANCE_THRESHOLD === 0.05);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
