// validateTemplate.test.mjs — zero-dependency smoke test. Run: node <thisfile>
import { validateTemplate, isTemplateValid, countErrors } from './validateTemplate.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};
const hasCode = (issues, code) => issues.some(i => i.code === code);

// ── A healthy template (weights sum 100, each phase's duration_pct sums to 1) ──
const healthy = {
  phases: [
    { id: 'a', label: 'A', order: 1, progressWeight: 40 },
    { id: 'b', label: 'B', order: 2, progressWeight: 60 },
  ],
  workPackages: [
    { id: 'a.1', label: 'A1', phaseId: 'a', duration_pct: 0.5 },
    { id: 'a.2', label: 'A2', phaseId: 'a', duration_pct: 0.5 },
    { id: 'b.1', label: 'B1', phaseId: 'b', duration_pct: 1.0 },
  ],
};

console.log('\n1) Healthy template → no errors');
const h = validateTemplate(healthy);
check('returns array', Array.isArray(h));
check('no error-severity issues', !h.some(i => i.severity === 'error'));
check('isTemplateValid === true', isTemplateValid(healthy) === true);

console.log('\n2) Weights sum ≠ 100 → WEIGHT_SUM');
const badWeights = { ...healthy, phases: [
  { id: 'a', label: 'A', order: 1, progressWeight: 40 },
  { id: 'b', label: 'B', order: 2, progressWeight: 70 }, // sum = 110
]};
check('catches WEIGHT_SUM', hasCode(validateTemplate(badWeights), 'WEIGHT_SUM'));

console.log('\n3) duration_pct in a phase ≠ 1.0 → DURATION_SUM');
const badDur = { ...healthy, workPackages: [
  { id: 'a.1', label: 'A1', phaseId: 'a', duration_pct: 0.3 },
  { id: 'a.2', label: 'A2', phaseId: 'a', duration_pct: 0.3 }, // sum = 0.6
  { id: 'b.1', label: 'B1', phaseId: 'b', duration_pct: 1.0 },
]};
check('catches DURATION_SUM', hasCode(validateTemplate(badDur), 'DURATION_SUM'));

console.log('\n4) Orphan WP (bad phaseId) → ORPHAN_WP');
const orphan = { ...healthy, workPackages: [
  ...healthy.workPackages,
  { id: 'x.1', label: 'X', phaseId: 'ghost', duration_pct: 1.0 },
]};
check('catches ORPHAN_WP', hasCode(validateTemplate(orphan), 'ORPHAN_WP'));

console.log('\n5) Duplicate phase id → DUP_PHASE_ID');
const dupPhase = { ...healthy, phases: [
  { id: 'a', label: 'A', order: 1, progressWeight: 40 },
  { id: 'a', label: 'A again', order: 2, progressWeight: 60 },
]};
check('catches DUP_PHASE_ID', hasCode(validateTemplate(dupPhase), 'DUP_PHASE_ID'));

console.log('\n6) Malformed input → never throws');
let threw = false;
try { validateTemplate({}); validateTemplate(null ?? {}); validateTemplate({ phases: [], workPackages: [] }); }
catch { threw = true; }
check('does not throw on empty/missing', threw === false);

console.log('\n7) countErrors');
check('0 errors for a healthy template', countErrors(h) === 0);
check('counts only error-severity issues, not warnings',
  countErrors(validateTemplate(badWeights)) === validateTemplate(badWeights).filter(i => i.severity === 'error').length);
check('empty issues list -> 0', countErrors([]) === 0);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);