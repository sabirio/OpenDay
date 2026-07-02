// confidenceInsights.test.mjs — unit tests for confidenceToInsights (rule A).
// Run: node src/core/insights/__tests__/confidenceInsights.test.mjs
import { confidenceToInsights } from '../adapters/confidenceInsights.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Helpers ───────────────────────────────────────────────────────────────

function conf(reportEarned, freshnessEarned) {
  return {
    level: 'LOW',
    label: 'Limited data',
    breakdown: [
      {
        dimension: 'Report history',
        earned: reportEarned,
        max: 3,
        detail: reportEarned === 0 ? 'No reports submitted' : `${reportEarned * 4} reports submitted`,
      },
      {
        dimension: 'PM site visits',
        earned: 0,
        max: 3,
        detail: 'No site visits recorded',
      },
      {
        dimension: 'Report freshness',
        earned: freshnessEarned,
        max: 2,
        detail: freshnessEarned === 0 ? 'No recent report' : 'Last report 5d ago',
      },
    ],
  };
}

function row(id, confidence) {
  return { project: { id, storeCode: `S${id}` }, confidence };
}

// ── 1. No reports (history earned = 0) → emits card ──────────────────────

console.log('\n1) No reports (Report history earned = 0) → emits card');
const r1 = confidenceToInsights([row('p1', conf(0, 2))]);
check('emits one card',            r1.length === 1);
check('source = confidence',       r1[0].source === 'confidence');
check('severity = warning',        r1[0].severity === 'warning');
check('scope = project',           r1[0].scope === 'project');
check('projectId = p1',            r1[0].projectId === 'p1');
check('title = Low data confidence', r1[0].title === 'Low data confidence');
check('detail mentions no reports', r1[0].detail?.includes('No reports submitted'));
check('recommendedAction set',     !!r1[0].recommendedAction);
check('priorityScore = 5',         r1[0].priorityScore === 5);
check('id unique to project',      r1[0].id === 'confidence:p1:data-absent');

// ── 2. Stale / no freshness (freshness earned = 0) → emits card ───────────

console.log('\n2) Stale freshness (Report freshness earned = 0) → emits card');
const r2 = confidenceToInsights([row('p2', conf(1, 0))]);
check('emits card for stale',          r2.length === 1);
check('detail mentions No recent report', r2[0].detail?.includes('No recent report'));

// ── 3. Both no-reports AND stale → single card with combined detail ────────

console.log('\n3) Both conditions → one card, combined detail');
const r3 = confidenceToInsights([row('p3', conf(0, 0))]);
check('still one card (not two)',   r3.length === 1);
check('detail contains report part', r3[0].detail?.includes('No reports submitted'));
check('detail contains freshness part', r3[0].detail?.includes('No recent report'));

// ── 4. HIGH confidence / sufficient data → no card ────────────────────────

console.log('\n4) Sufficient data → no card emitted');
const highConf = {
  level: 'HIGH',
  label: 'High confidence',
  breakdown: [
    { dimension: 'Report history',  earned: 3, max: 3, detail: '8+ reports' },
    { dimension: 'PM site visits',  earned: 3, max: 3, detail: '2+ visits' },
    { dimension: 'Report freshness', earned: 2, max: 2, detail: 'Last report 3d ago' },
  ],
};
const r4 = confidenceToInsights([row('p4', highConf)]);
check('HIGH confidence → no card',    r4.length === 0);

// ── 5. Earned > 0 on both report dims → no card ───────────────────────────

console.log('\n5) Partial data (earned > 0 on both) → no card');
const r5 = confidenceToInsights([row('p5', conf(1, 1))]);
check('partial data → no card',    r5.length === 0);

// ── 6. Multiple rows — only affected projects emit ────────────────────────

console.log('\n6) Multiple rows — selective emission');
const r6 = confidenceToInsights([
  row('p1', conf(0, 2)),  // no reports → card
  row('p2', highConf),    // high conf → no card
  row('p3', conf(1, 0)),  // stale → card
]);
check('2 cards from 3 rows',          r6.length === 2);
check('p1 card present',              r6.some(i => i.projectId === 'p1'));
check('p3 card present',              r6.some(i => i.projectId === 'p3'));
check('p2 (high conf) not emitted',   !r6.some(i => i.projectId === 'p2'));

// ── 7. Rows missing confidence or project → skipped ──────────────────────

console.log('\n7) Defensive: missing confidence or project → skipped');
const r7 = confidenceToInsights([
  { project: { id: 'p1' }, confidence: null },
  { project: null, confidence: conf(0, 0) },
  { confidence: conf(0, 0) }, // no project at all
]);
check('null confidence → skipped',    r7.length === 0);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
