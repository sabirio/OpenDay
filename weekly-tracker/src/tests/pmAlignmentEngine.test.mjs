// pmAlignmentEngine.test.mjs — zero-dependency smoke tests.
// Run: node src/tests/pmAlignmentEngine.test.mjs
//
// Same data: URL loader as the prior three .test.mjs files — Node 22 requires
// explicit extensions for ESM; pmAlignmentEngine.js imports ../utils/reportUtils,
// ../config/workPackages, ../config/reportWeights all without extensions.
//
// ─── Status strings used (from WP_STATUS_SCORES in workPackages.js) ──────────
//   'Not Started' → 0       'In Progress' → 0.5
//   'Completed'   → 1       'Delayed'     → 0.3
//   'Not Applicable' → null → buildAlignmentItem returns null → item skipped
//
// ─── diff = gcScore - pmScore (positive = GC overstates PM) ─────────────────
//   'Completed'(1) - 'Not Started'(0)   = 1.0  → Major overstatement / CRITICAL
//   'Completed'(1) - 'In Progress'(0.5) = 0.5  → Overstatement / HIGH
//   'Delayed'(0.3) - 'Not Started'(0)   = 0.3  → Minor overstatement / MEDIUM
//                                                  (overstate=false — threshold is diff>0.4)
//   'In Progress'(0.5) - 'In Progress'(0.5) = 0 → Match / null
//   'In Progress'(0.5) - 'Completed'(1)    = -0.5 → PM ahead / null
//
// ─── overstate threshold is diff > 0.4 (strict), NOT ≥ 0.4 ─────────────────
//   diff = 0.3 → mismatchType="Minor overstatement", severity="MEDIUM", overstate=false
//   diff = 0.5 → mismatchType="Overstatement",       severity="HIGH",   overstate=true
//
// ─── Legacy key samples (from reportWeights.js — CONS/TEST/HAND_KEYS) ───────
//   CONS_KEYS[0] = 'Flooring installation'
//   TEST_KEYS[0] = 'Sprinkler system testing and commissioning'
//   HAND_KEYS[0] = 'Staff training'
//
// ─── WP format (new path) ────────────────────────────────────────────────────
//   WP id used: 'demolition', task: 'Demolition works'  (from WORK_PACKAGES)
//   gcReport   = { workPackageStatuses: { [wpId]: { [taskName]: { status } } } }
//   pmVisit    = { pmWorkPackageStatuses: { [wpId]: { [taskName]: { observedStatus } } } }
//   The WP path ONLY emits an item when pmEntry?.observedStatus is truthy.
//   A task the PM has not observed is silently skipped regardless of GC status.
//
// ─── Legacy format (fallback) ────────────────────────────────────────────────
//   gcReport = { demolitionStatus, constructionStatuses:{[CONS_KEY]:status}, ... }
//   pmVisit  = { demolitionStatus, constructionStatuses:{[CONS_KEY]:status}, ... }
//   push helper calls buildAlignmentItem(name, gcS||"", pmS||"") — empty string treated
//   as "no data"; gcStatus/pmStatus in the returned item default to '—' if falsy.
//
// NOT wired into runTests.js (that runner imports named exports from .js files).
// Run separately: node src/tests/pmAlignmentEngine.test.mjs

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
  computePmAlignmentItems,
  computeConfidenceLevel,
  summarizeAlignmentItems,
  CONS_KEYS,
  TEST_KEYS,
  HAND_KEYS,
} = await import('../engines/pmAlignmentEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// Helpers for computeConfidenceLevel — only .length is checked, so plain arrays suffice
const nArr = n => Array.from({ length: n });
const lr   = msAgo => ({ reportingDate: iso(now - msAgo) });

// Shared: empty legacy column maps so only demolitionStatus is compared unless told otherwise
const EMPTY = { constructionStatuses: {}, testingStatuses: {}, handoverStatuses: {} };

// ── A) computePmAlignmentItems — buildAlignmentItem branch logic via legacy format ──
// Using legacy format (no workPackageStatuses) so only demolitionStatus is in play.
// All five mismatchType branches are hit plus the three skip conditions.
console.log('\nA) computePmAlignmentItems — null guards, skips, diff branches');

// A1/A2: null arguments → returns []
check('A1: null gcReport → []',  computePmAlignmentItems(null, {}).length === 0);
check('A2: null pmVisit → []',   computePmAlignmentItems({}, null).length === 0);

// A3: both sides empty string → buildAlignmentItem receives ("Demolition","","") →
//   !gcS && !pmS → returns null → item skipped
{
  const items = computePmAlignmentItems(
    { demolitionStatus: '', ...EMPTY },
    { demolitionStatus: '', ...EMPTY },
  );
  check('A3: both sides empty → no items produced', items.length === 0);
}

// A4/A5: "Not Applicable" on either side → item skipped
{
  const na1 = computePmAlignmentItems(
    { demolitionStatus: 'Not Applicable', ...EMPTY },
    { demolitionStatus: 'In Progress',    ...EMPTY },
  );
  check('A4: gc="Not Applicable" → item skipped', na1.length === 0);

  const na2 = computePmAlignmentItems(
    { demolitionStatus: 'Completed',      ...EMPTY },
    { demolitionStatus: 'Not Applicable', ...EMPTY },
  );
  check('A5: pm="Not Applicable" → item skipped', na2.length === 0);
}

// A6: diff > 0.75 → "Major overstatement" / "CRITICAL" / overstate=true
// 'Completed'(1.0) - 'Not Started'(0) = 1.0
{
  const items = computePmAlignmentItems(
    { demolitionStatus: 'Completed',   ...EMPTY },
    { demolitionStatus: 'Not Started', ...EMPTY },
  );
  check('A6: diff=1.0 → mismatchType="Major overstatement"', items[0]?.mismatchType === 'Major overstatement');
  check('A6: diff=1.0 → severity="CRITICAL"',                items[0]?.severity     === 'CRITICAL');
  check('A6: diff=1.0 → overstate=true',                     items[0]?.overstate    === true);
}

// A7: 0.4 < diff ≤ 0.75 → "Overstatement" / "HIGH" / overstate=true
// 'Completed'(1.0) - 'In Progress'(0.5) = 0.5
{
  const items = computePmAlignmentItems(
    { demolitionStatus: 'Completed',   ...EMPTY },
    { demolitionStatus: 'In Progress', ...EMPTY },
  );
  check('A7: diff=0.5 → mismatchType="Overstatement"', items[0]?.mismatchType === 'Overstatement');
  check('A7: diff=0.5 → severity="HIGH"',              items[0]?.severity     === 'HIGH');
  check('A7: diff=0.5 → overstate=true',               items[0]?.overstate    === true);
}

// A8: 0.15 < diff ≤ 0.4 → "Minor overstatement" / "MEDIUM" / overstate=FALSE
// 'Delayed'(0.3) - 'Not Started'(0) = 0.3
// Key insight: overstate threshold is diff > 0.4 (STRICT) — diff=0.3 does NOT set overstate.
{
  const items = computePmAlignmentItems(
    { demolitionStatus: 'Delayed',     ...EMPTY },
    { demolitionStatus: 'Not Started', ...EMPTY },
  );
  check('A8: diff=0.3 → mismatchType="Minor overstatement"',   items[0]?.mismatchType === 'Minor overstatement');
  check('A8: diff=0.3 → severity="MEDIUM"',                    items[0]?.severity     === 'MEDIUM');
  check('A8: diff=0.3 → overstate=false (threshold is >0.4)',  items[0]?.overstate    === false);
}

// A9: |diff| ≤ 0.15 → "Match" / severity=null / match=true
// 'In Progress'(0.5) - 'In Progress'(0.5) = 0
{
  const items = computePmAlignmentItems(
    { demolitionStatus: 'In Progress', ...EMPTY },
    { demolitionStatus: 'In Progress', ...EMPTY },
  );
  check('A9: diff=0 → mismatchType="Match"', items[0]?.mismatchType === 'Match');
  check('A9: diff=0 → severity=null',        items[0]?.severity     === null);
  check('A9: diff=0 → match=true',           items[0]?.match        === true);
}

// A10: diff < -0.15 → "PM ahead" / severity=null
// 'In Progress'(0.5) - 'Completed'(1.0) = -0.5
{
  const items = computePmAlignmentItems(
    { demolitionStatus: 'In Progress', ...EMPTY },
    { demolitionStatus: 'Completed',   ...EMPTY },
  );
  check('A10: diff=-0.5 → mismatchType="PM ahead"', items[0]?.mismatchType === 'PM ahead');
  check('A10: diff=-0.5 → severity=null',           items[0]?.severity     === null);
}

// A11: gcStatus defaults to '—' when gc side is empty/absent
// gc has no demolitionStatus → push("Demolition", undefined||"", "In Progress") → gcS="" → "—"
{
  const items = computePmAlignmentItems(
    { ...EMPTY },                              // no demolitionStatus → "" after ||
    { demolitionStatus: 'In Progress', ...EMPTY },
  );
  check('A11: absent gc demolitionStatus → item.gcStatus="—"', items[0]?.gcStatus === '—');
}

// A12: item.diff is gcScore - pmScore (numeric identity)
{
  const items = computePmAlignmentItems(
    { demolitionStatus: 'Completed',   ...EMPTY },
    { demolitionStatus: 'In Progress', ...EMPTY },
  );
  const i = items[0];
  check('A12: item.diff === item.gcScore - item.pmScore', i !== undefined && i.diff === i.gcScore - i.pmScore);
}

// ── B) Format auto-detect ──────────────────────────────────────────────────────
// WP format triggered when gcReport.workPackageStatuses != null OR
//   pmVisit.pmWorkPackageStatuses != null; otherwise falls back to legacy.
console.log('\nB) Format auto-detect — WP path vs legacy path');

// B1: WP format detected → WP path; diff and taskName populated correctly
// WP id: 'demolition', task: 'Demolition works' (from WORK_PACKAGES)
// 'Completed'(1.0) - 'In Progress'(0.5) = 0.5 → Overstatement
{
  const gc = { workPackageStatuses: { demolition: { 'Demolition works': { status: 'Completed' } } } };
  const pm = { pmWorkPackageStatuses: { demolition: { 'Demolition works': { observedStatus: 'In Progress' } } } };
  const items = computePmAlignmentItems(gc, pm);
  check('B1: WP format → item produced',       items.length > 0);
  check('B1: WP format → diff=0.5',            items[0]?.diff     === 0.5);
  check('B1: WP format → taskName populated',  items[0]?.taskName === 'Demolition works');
}

// B2: WP format — task with GC status but no PM observedStatus → skipped
// The WP path only emits an item when pmEntry?.observedStatus is truthy.
// pmWorkPackageStatuses:{} → pmWP=undefined → pmEntry=undefined → pmS=null → continue
{
  const gc = { workPackageStatuses: { demolition: { 'Demolition works': { status: 'Completed' } } } };
  const pm = { pmWorkPackageStatuses: {} };
  check('B2: WP task not observed by PM → skipped → items=[]',
    computePmAlignmentItems(gc, pm).length === 0);
}

// B3: Legacy format (neither key present → legacy path)
// Only demolitionStatus produces an item; CONS/TEST/HAND empty maps → skipped.
{
  const gc = { demolitionStatus: 'Completed',   ...EMPTY };
  const pm = { demolitionStatus: 'In Progress', ...EMPTY };
  const items = computePmAlignmentItems(gc, pm);
  check('B3: legacy format → 1 item (demolitionStatus only)', items.length === 1);
  check('B3: legacy item.name="Demolition"',                  items[0]?.name === 'Demolition');
}

// B4: Legacy format using CONS_KEYS[0] — confirms real key is accepted and name set correctly
// CONS_KEYS[0] = 'Flooring installation'  (from constructionWeights in reportWeights.js)
// Note: do NOT spread EMPTY here — its constructionStatuses:{} would override the key we set.
{
  const gc = { constructionStatuses: { [CONS_KEYS[0]]: 'Completed'   }, testingStatuses: {}, handoverStatuses: {} };
  const pm = { constructionStatuses: { [CONS_KEYS[0]]: 'In Progress' }, testingStatuses: {}, handoverStatuses: {} };
  const items = computePmAlignmentItems(gc, pm);
  check('B4: CONS_KEY item produced',            items.length === 1);
  check('B4: item.name === CONS_KEYS[0]',        items[0]?.name === CONS_KEYS[0]);
}

// ── C) computeConfidenceLevel ──────────────────────────────────────────────────
// Points breakdown (max 8):
//   reportCount ≥8→+3, ≥4→+2, ≥1→+1, else 0
//   visitCount  ≥2→+3, =1→+2, else 0
//   freshness   ≤7d→+2, ≤14d→+1, else 0 (or 0 when latestReport is null)
// Levels: 0-2 LOW | 3-5 MEDIUM | 6-8 HIGH
console.log('\nC) computeConfidenceLevel — points accumulation + level thresholds');

// C1: no data → 0 pts → LOW
{
  const r = computeConfidenceLevel(nArr(0), nArr(0), null);
  check('C1: (0,0,null) → pts=0',    r.pts   === 0);
  check('C1: (0,0,null) → level=LOW', r.level === 'LOW');
}

// C2: 1 report + 0 visits + today → pts=1+0+2=3 → MEDIUM
// (proves: report ≥1 → +1; freshness daysSince=0 ≤7 → +2)
{
  const r = computeConfidenceLevel(nArr(1), nArr(0), lr(0));
  check('C2: (1,0,today) → pts=3',     r.pts   === 3);
  check('C2: (1,0,today) → MEDIUM',    r.level === 'MEDIUM');
}

// C3: 1 report + 0 visits + 8d old → pts=1+0+1=2 → LOW
// (proves: 7 < daysSince ≤ 14 → +1; total 2 is below MEDIUM threshold of 3)
{
  const r = computeConfidenceLevel(nArr(1), nArr(0), lr(8 * DAY));
  check('C3: (1,0,8d) → pts=2',     r.pts   === 2);
  check('C3: (1,0,8d) → LOW',       r.level === 'LOW');
}

// C4: 1 report + 0 visits + 15d old → pts=1 (daysSince=15 > 14 → +0; same as null)
{
  check('C4: (1,0,15d) → pts=1 (>14d → no freshness bonus)',
    computeConfidenceLevel(nArr(1), nArr(0), lr(15 * DAY)).pts === 1);
}

// C5: 1 report + 0 visits + null latestReport → pts=1 (no freshness points)
{
  check('C5: (1,0,null) → pts=1 (null latestReport → no freshness)',
    computeConfidenceLevel(nArr(1), nArr(0), null).pts === 1);
}

// C6: 8 reports + 2 visits + null → pts=3+3+0=6 → HIGH
// (proves: reports ≥8 → +3; visits ≥2 → +3)
{
  const r = computeConfidenceLevel(nArr(8), nArr(2), null);
  check('C6: (8,2,null) → pts=6',    r.pts   === 6);
  check('C6: (8,2,null) → HIGH',     r.level === 'HIGH');
}

// C7: 8 reports + 2 visits + today → pts=8 (maximum), maxPts=8
{
  const r = computeConfidenceLevel(nArr(8), nArr(2), lr(0));
  check('C7: (8,2,today) → pts=8',  r.pts    === 8);
  check('C7: maxPts=8',             r.maxPts  === 8);
}

// C8: 1 report + 1 visit + null → pts=1+2=3 → MEDIUM (1 visit → +2, hits MEDIUM threshold)
{
  check('C8: (1,1,null) → MEDIUM (1 visit → +2 → total 3)',
    computeConfidenceLevel(nArr(1), nArr(1), null).level === 'MEDIUM');
}

// ── D) summarizeAlignmentItems ─────────────────────────────────────────────────
console.log('\nD) summarizeAlignmentItems — matchRate + filter arrays');

// D1: empty array → matchRate=100 (no items → 100 by convention)
check('D1: [] → matchRate=100', summarizeAlignmentItems([]).matchRate === 100);

// D2-D5: mixed array → matchRate, overstatements, matches
{
  const items = [
    { overstate: true,  match: false },
    { overstate: true,  match: false },
    { overstate: false, match: true  },
  ];
  const r = summarizeAlignmentItems(items);
  // matchRate = Math.round(1/3 * 100) = Math.round(33.33) = 33
  check('D2: matchRate = round(1/3*100) = 33',   r.matchRate            === 33);
  check('D3: overstatements.length = 2',          r.overstatements.length === 2);
  check('D4: matches.length = 1',                 r.matches.length        === 1);
  check('D5: overstatements[0].overstate = true', r.overstatements[0]?.overstate === true);
}

// ── E) computeConfidenceLevel — breakdown array (new field) ───────────────────
console.log('\nE) computeConfidenceLevel — breakdown field');

// E1: breakdown is an array with exactly 3 dimensions
{
  const r = computeConfidenceLevel(nArr(0), nArr(0), null);
  check('E1a: breakdown is array',         Array.isArray(r.breakdown));
  check('E1b: breakdown has 3 items',      r.breakdown.length === 3);
}

// E2: dimension names are correct and in order
{
  const r = computeConfidenceLevel(nArr(0), nArr(0), null);
  check('E2a: dim[0]="Report history"',    r.breakdown[0].dimension === 'Report history');
  check('E2b: dim[1]="PM site visits"',    r.breakdown[1].dimension === 'PM site visits');
  check('E2c: dim[2]="Report freshness"',  r.breakdown[2].dimension === 'Report freshness');
}

// E3: max values per dimension
{
  const r = computeConfidenceLevel(nArr(0), nArr(0), null);
  check('E3a: report history max=3',       r.breakdown[0].max === 3);
  check('E3b: site visits max=3',          r.breakdown[1].max === 3);
  check('E3c: freshness max=2',            r.breakdown[2].max === 2);
}

// E4: earned values match pts for known cases
{
  // 8 reports + 2 visits + today → 3+3+2=8
  const r = computeConfidenceLevel(nArr(8), nArr(2), lr(0));
  check('E4a: 8 reports → earned=3',       r.breakdown[0].earned === 3);
  check('E4b: 2 visits → earned=3',        r.breakdown[1].earned === 3);
  check('E4c: 0d → earned=2',             r.breakdown[2].earned === 2);
}
{
  // 4 reports + 1 visit + 8d → 2+2+1=5
  const r = computeConfidenceLevel(nArr(4), nArr(1), lr(8 * DAY));
  check('E4d: 4 reports → earned=2',       r.breakdown[0].earned === 2);
  check('E4e: 1 visit → earned=2',         r.breakdown[1].earned === 2);
  check('E4f: 8d → earned=1',             r.breakdown[2].earned === 1);
}

// E5: sum(earned) === pts invariant
{
  const cases = [
    [nArr(0),  nArr(0),  null],
    [nArr(1),  nArr(0),  lr(0)],
    [nArr(4),  nArr(1),  lr(8 * DAY)],
    [nArr(8),  nArr(2),  lr(0)],
    [nArr(10), nArr(3),  null],
  ];
  for (const [rr, vv, ll] of cases) {
    const res = computeConfidenceLevel(rr, vv, ll);
    const sum = res.breakdown.reduce((s, b) => s + b.earned, 0);
    check(`E5: ${rr.length}r/${vv.length}v → sum(earned)=${sum}===pts=${res.pts}`, sum === res.pts);
  }
}

// E6: detail strings — zero case and non-zero case
{
  const r0 = computeConfidenceLevel(nArr(0), nArr(0), null);
  check('E6a: 0 reports → detail "No reports submitted"',
    r0.breakdown[0].detail === 'No reports submitted');
  check('E6b: 0 visits → detail "No site visits recorded"',
    r0.breakdown[1].detail === 'No site visits recorded');
  check('E6c: null latestReport → detail "No recent report"',
    r0.breakdown[2].detail === 'No recent report');

  const r1 = computeConfidenceLevel(nArr(1), nArr(1), null);
  check('E6d: 1 report → singular "1 report submitted"',
    r1.breakdown[0].detail === '1 report submitted');
  check('E6e: 1 visit → singular "1 site visit recorded"',
    r1.breakdown[1].detail === '1 site visit recorded');

  const r4 = computeConfidenceLevel(nArr(4), nArr(2), null);
  check('E6f: 4 reports → plural "4 reports submitted"',
    r4.breakdown[0].detail === '4 reports submitted');
  check('E6g: 2 visits → plural "2 site visits recorded"',
    r4.breakdown[1].detail === '2 site visits recorded');
}

// E7: existing return fields unchanged (additive only — no regressions)
{
  const r = computeConfidenceLevel(nArr(4), nArr(1), lr(8 * DAY));
  check('E7a: level still present',  typeof r.level === 'string');
  check('E7b: pts still present',    typeof r.pts === 'number');
  check('E7c: maxPts still 8',       r.maxPts === 8);
  check('E7d: color still present',  typeof r.color === 'string');
  check('E7e: colorBg still present', typeof r.colorBg === 'string');
  check('E7f: label still present',  typeof r.label === 'string');
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
