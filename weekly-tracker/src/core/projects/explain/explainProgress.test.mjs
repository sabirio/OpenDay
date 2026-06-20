// explainProgress.test.mjs — zero-dependency smoke tests. Run: node <thisfile>
import { explainProgress } from './explainProgress.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Phase A (weight 40%) split 50/50 → each WP gets 0.20 of total
// Phase B (weight 60%) single WP   → 0.60
const WPS = [
  { id: 'a.1', phaseId: 'a', label: 'A1' },
  { id: 'a.2', phaseId: 'a', label: 'A2' },
  { id: 'b.1', phaseId: 'b', label: 'B1' },
];
const PHASES = [
  { id: 'a', label: 'Phase A' },
  { id: 'b', label: 'Phase B' },
];
const EW = { 'a.1': 0.20, 'a.2': 0.20, 'b.1': 0.60 };
const TP = { 'a.1': 80, 'a.2': 60, 'b.1': 50 };
// Hand-computed total = 0.20*80 + 0.20*60 + 0.60*50 = 16 + 12 + 30 = 58

// ── 1) Attribution sums to total; drift ≈ 0 vs officialTotal ─────────────────
console.log('\n1) Attribution sums to total; drift ≈ 0');
const r1 = explainProgress({ effectiveWeights: EW, taskProgress: TP, workPackages: WPS, phases: PHASES, officialTotal: 58 });
check('total = 58',                 Math.abs(r1.total - 58) < 0.001);
check('drift ≈ 0',                  Math.abs(r1.drift) < 0.001);
check('denominator ≈ 1.0',          Math.abs(r1.denominator - 1.0) < 0.001);
check('lines length = 3',           r1.lines.length === 3);
check('lines sorted desc by contrib', r1.lines[0].contribution >= r1.lines[1].contribution);
check('officialTotal passed through', r1.officialTotal === 58);

// ── 2) Excluded WPs detected when scope omits them ────────────────────────────
console.log('\n2) Excluded WPs when scope omits a.2');
const EW2 = { 'a.1': 0.40, 'b.1': 0.60 };
const r2  = explainProgress({ effectiveWeights: EW2, taskProgress: TP, workPackages: WPS, phases: PHASES, officialTotal: null });
check('excluded length = 1',          r2.excluded.length === 1);
check('excluded[0].wpId = a.2',       r2.excluded[0].wpId === 'a.2');
check('excluded[0].reason = NOT_IN_SCOPE', r2.excluded[0].reason === 'NOT_IN_SCOPE');
check('excluded[0].phaseId = a',      r2.excluded[0].phaseId === 'a');
check('lines length = 2 (in scope)',  r2.lines.length === 2);
check('drift = null (no officialTotal)', r2.drift === null);

// ── 3) Empty effectiveWeights → total 0, no throw ────────────────────────────
console.log('\n3) Empty effectiveWeights → total 0, no throw');
let threw = false, r3;
try { r3 = explainProgress({ effectiveWeights: {}, taskProgress: {}, workPackages: WPS, phases: PHASES, officialTotal: null }); }
catch { threw = true; }
check('no throw',             threw === false);
check('total = 0',            r3?.total === 0);
check('denominator = 0',      r3?.denominator === 0);
check('lines = []',           r3?.lines.length === 0);
check('excluded = all 3 WPs', r3?.excluded.length === 3);

// ── 4) byPhase progress = weighted average within phase ───────────────────────
console.log('\n4) byPhase rolls up correctly');
// Phase A: (0.20*80 + 0.20*60) / (0.20+0.20) = 28 / 0.40 = 70
// Phase B: (0.60*50) / 0.60 = 50
const phA = r1.byPhase.find(p => p.phaseId === 'a');
const phB = r1.byPhase.find(p => p.phaseId === 'b');
check('byPhase[0] = phase a (ordered)',  r1.byPhase[0].phaseId === 'a');
check('byPhase[1] = phase b (ordered)',  r1.byPhase[1].phaseId === 'b');
check('phase A phaseProgress = 70',     Math.abs(phA.phaseProgress - 70) < 0.001);
check('phase B phaseProgress = 50',     Math.abs(phB.phaseProgress - 50) < 0.001);
check('phase A contribution = 28',      Math.abs(phA.contribution - 28) < 0.001);
check('phase B contribution = 30',      Math.abs(phB.contribution - 30) < 0.001);
check('phase labels present',           phA.label === 'Phase A' && phB.label === 'Phase B');

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
