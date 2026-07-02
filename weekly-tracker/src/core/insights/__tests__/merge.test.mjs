// merge.test.mjs — unit tests for mergeInsights.
// Run: node src/core/insights/__tests__/merge.test.mjs
import { mergeInsights } from '../merge.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const mkInsight = (id, severity, priorityScore, source = 'test') => ({
  id, source, severity, scope: 'project', projectId: 'p1',
  title: `${id} title`, detail: `${id} detail`,
  priorityScore,
});

const CRITICAL  = mkInsight('portfolio:p1:Opening approaching', 'critical', 0, 'portfolio');
const WARNING   = mkInsight('command:ST01:behind_schedule',     'warning',  1, 'command');
const INFO      = mkInsight('command:ST01:all_clear',           'info',     2, 'command');
// Duplicate of CRITICAL — same id, different title (to verify first-wins)
const DUP_CRIT  = { ...CRITICAL, title: 'DUPLICATE — should not appear' };

// ── 1. Deduplication: first wins ──────────────────────────────────────────
console.log('\n1) Dedupe by id (first wins)');
const deduped = mergeInsights([CRITICAL], [DUP_CRIT, WARNING]);
const critItem = deduped.find(x => x.id === CRITICAL.id);
check('only one item with that id',         deduped.filter(x => x.id === CRITICAL.id).length === 1);
check('first-wins: original title kept',    critItem?.title === CRITICAL.title);
check('total length = 2 (not 3)',           deduped.length === 2);

// ── 2. Portfolio + command insights merged, sorted critical→warning→info ──
console.log('\n2) Merges portfolio + command, sorted critical→warning→info');
const merged = mergeInsights([WARNING, INFO], [CRITICAL]);
check('length = 3',                         merged.length === 3);
check('merged[0] = critical (priorityScore 0)', merged[0].priorityScore === 0);
check('merged[1] = warning  (priorityScore 1)', merged[1].priorityScore === 1);
check('merged[2] = info     (priorityScore 2)', merged[2].priorityScore === 2);
check('merged[0].source = portfolio',       merged[0].source === 'portfolio');
check('merged[1].source = command',         merged[1].source === 'command');

// ── 3. Empty inputs → [] ──────────────────────────────────────────────────
console.log('\n3) Empty inputs → []');
check('no args → []',          mergeInsights().length === 0);
check('empty lists → []',      mergeInsights([], []).length === 0);
check('one empty + one → 1',   mergeInsights([], [CRITICAL]).length === 1);

// ── 4. Single list passthrough, still sorted ──────────────────────────────
console.log('\n4) Single list: still deduped + sorted');
const single = mergeInsights([INFO, WARNING, CRITICAL]);
check('length = 3',                         single.length === 3);
check('sorted: first is critical',          single[0].priorityScore === 0);
check('sorted: last is info',               single[2].priorityScore === 2);

// ── 5. Does not mutate input arrays ──────────────────────────────────────
console.log('\n5) Input arrays not mutated');
const list1 = [WARNING, CRITICAL];
const list2 = [INFO];
mergeInsights(list1, list2);
check('list1 order unchanged', list1[0].id === WARNING.id);
check('list2 untouched',       list2[0].id === INFO.id);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
