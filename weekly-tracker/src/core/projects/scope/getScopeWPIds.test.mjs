// getScopeWPIds.test.mjs — unit tests for the scope WP-id helper.
// Run: node src/core/projects/scope/getScopeWPIds.test.mjs
import { getScopeWPIds } from './getScopeWPIds.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const WPS = [
  { id: 'a.1', phaseId: 'a' },
  { id: 'a.2', phaseId: 'a' },
  { id: 'b.1', phaseId: 'b' },
  { id: 'b.2', phaseId: 'b' },
  { id: 'c.1', phaseId: 'c' },
];

// ── 1. null / undefined scope → null (full scope, no restriction) ─────────
console.log('\n1) null / undefined scope → null');
check('null scope → null',      getScopeWPIds(null, WPS) === null);
check('undefined scope → null', getScopeWPIds(undefined, WPS) === null);

// ── 2. Empty scope object → all ids ───────────────────────────────────────
console.log('\n2) Empty scope object → all WP ids');
const all = getScopeWPIds({}, WPS);
check('returns array',          Array.isArray(all));
check('length = 5 (all)',       all.length === 5);
check('contains a.1',          all.includes('a.1'));
check('contains c.1',          all.includes('c.1'));

// ── 3. phases-only filter ─────────────────────────────────────────────────
console.log('\n3) phases-only filter');
const phaseA = getScopeWPIds({ phases: ['a'] }, WPS);
check('returns 2 ids',         phaseA.length === 2);
check('contains a.1',          phaseA.includes('a.1'));
check('contains a.2',          phaseA.includes('a.2'));
check('excludes b.1',          !phaseA.includes('b.1'));

const phaseAB = getScopeWPIds({ phases: ['a', 'b'] }, WPS);
check('phases a+b → 4 ids',    phaseAB.length === 4);

// ── 4. workPackages-only filter ───────────────────────────────────────────
console.log('\n4) workPackages-only filter');
const wpOnly = getScopeWPIds({ workPackages: ['a.1', 'b.2'] }, WPS);
check('returns 2 ids',         wpOnly.length === 2);
check('contains a.1',          wpOnly.includes('a.1'));
check('contains b.2',          wpOnly.includes('b.2'));
check('excludes a.2',          !wpOnly.includes('a.2'));

// ── 5. Both filters (intersection) ───────────────────────────────────────
console.log('\n5) phases + workPackages = intersection');
const both = getScopeWPIds({ phases: ['a'], workPackages: ['a.1', 'b.1'] }, WPS);
check('only a.1 (in phase a AND in WP list)', both.length === 1 && both[0] === 'a.1');

// ── 6. Empty result ───────────────────────────────────────────────────────
console.log('\n6) Empty result when nothing matches');
const none = getScopeWPIds({ phases: ['z'] }, WPS);
check('no matching phase → []', Array.isArray(none) && none.length === 0);

const noneWP = getScopeWPIds({ workPackages: ['z.1'] }, WPS);
check('no matching WP id → []', noneWP.length === 0);

// ── 7. Returns ids (strings), not objects ─────────────────────────────────
console.log('\n7) Returns string ids, not objects');
const ids = getScopeWPIds({ phases: ['a'] }, WPS);
check('all elements are strings', ids.every(x => typeof x === 'string'));

// ── 8. Does not mutate input ──────────────────────────────────────────────
console.log('\n8) Does not mutate inputs');
const scope = { phases: ['a'] };
const wpsOrig = [...WPS];
getScopeWPIds(scope, WPS);
check('scope unchanged',  scope.phases.length === 1);
check('WPS length unchanged', WPS.length === wpsOrig.length);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
