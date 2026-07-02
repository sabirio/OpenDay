// confidenceModifier.test.mjs — unit tests for applyConfidence (rule B).
// Run: node src/core/insights/__tests__/confidenceModifier.test.mjs
import { applyConfidence } from '../adapters/confidenceModifier.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────

const LOW_CONF  = { level: 'LOW',    label: 'Limited data' };
const MED_CONF  = { level: 'MEDIUM', label: 'Moderate confidence' };
const HIGH_CONF = { level: 'HIGH',   label: 'High confidence' };

function ins(overrides) {
  return {
    id: 'test:p1:x', source: 'command', severity: 'critical',
    scope: 'project', projectId: 'p1',
    title: 'Test', detail: 'D', priorityScore: 0,
    ...overrides,
  };
}

const BY_ID = id => obj => ({ ...obj })[id];

// ── 1. LOW confidence — severity step-down ─────────────────────────────────

console.log('\n1) LOW confidence — severity step-down');
const conf = { p1: LOW_CONF };

const crit = applyConfidence([ins({ severity: 'critical', priorityScore: 0 })], conf);
check('critical → warning', crit[0].severity === 'warning');

const warn = applyConfidence([ins({ severity: 'warning',  priorityScore: 1 })], conf);
check('warning → info',     warn[0].severity === 'info');

const info = applyConfidence([ins({ severity: 'info',     priorityScore: 2 })], conf);
check('info → info (floor)', info[0].severity === 'info');

const pos  = applyConfidence([ins({ severity: 'positive', priorityScore: 3 })], conf);
check('positive → positive (never touched)', pos[0].severity === 'positive');

// ── 2. LOW confidence — priorityScore penalty ─────────────────────────────

console.log('\n2) LOW confidence — priorityScore penalty');
check('critical: priorityScore 0 → 0.5', crit[0].priorityScore === 0.5);
check('warning:  priorityScore 1 → 1.5', warn[0].priorityScore === 1.5);
check('info:     priorityScore 2 → 2.5', info[0].priorityScore === 2.5);
check('penalty < 1',  (crit[0].priorityScore - 0) < 1);
// stays within band: dampened critical (now warning) at 0.5 < next band start (2.0 for info)
check('dampened-critical sinks below confident warning (score 0.5 > normal warning 1? no, 0.5 < 1 — still in warning band)', crit[0].priorityScore < 1);

// ── 3. LOW confidence — confidence badge attached ─────────────────────────

console.log('\n3) LOW confidence — badge attached');
check('critical: badge has level LOW',    crit[0].confidence?.level === 'LOW');
check('critical: badge has label',        typeof crit[0].confidence?.label === 'string');
check('critical: badge has reason',       typeof crit[0].confidence?.reason === 'string');
check('positive: NO badge (untouched)',   pos[0].confidence === undefined);

// ── 4. MEDIUM confidence — badge only, no severity/priority change ─────────

console.log('\n4) MEDIUM confidence — badge only');
const medConf = { p1: MED_CONF };
const medIns  = applyConfidence([ins({ severity: 'critical', priorityScore: 0 })], medConf);
check('MEDIUM: severity unchanged (critical)', medIns[0].severity === 'critical');
check('MEDIUM: priorityScore unchanged (0)',   medIns[0].priorityScore === 0);
check('MEDIUM: badge attached',                !!medIns[0].confidence);
check('MEDIUM: badge level = MEDIUM',          medIns[0].confidence?.level === 'MEDIUM');
check('MEDIUM: badge has reason',              typeof medIns[0].confidence?.reason === 'string');

// ── 5. HIGH confidence — no change, no badge ──────────────────────────────

console.log('\n5) HIGH confidence — no change');
const highConf = { p1: HIGH_CONF };
const highIns  = applyConfidence([ins({ severity: 'critical', priorityScore: 0 })], highConf);
check('HIGH: severity unchanged', highIns[0].severity === 'critical');
check('HIGH: priorityScore unchanged', highIns[0].priorityScore === 0);
check('HIGH: no confidence badge', !highIns[0].confidence);

// ── 6. Input array not mutated ────────────────────────────────────────────

console.log('\n6) Input immutability');
const original = [ins({ severity: 'critical', priorityScore: 0 })];
const before   = { ...original[0] };
applyConfidence(original, conf);
check('severity not mutated on original', original[0].severity === before.severity);
check('priorityScore not mutated',        original[0].priorityScore === before.priorityScore);
check('confidence not added to original', original[0].confidence === undefined);

// ── 7. Insights without matching projectId untouched ─────────────────────

console.log('\n7) Non-matching projectId → untouched');
const noMatch = applyConfidence([ins({ projectId: 'p999' })], conf);
check('unmatched projectId: severity unchanged',      noMatch[0].severity === 'critical');
check('unmatched projectId: no confidence badge',     !noMatch[0].confidence);
check('unmatched projectId: priorityScore unchanged', noMatch[0].priorityScore === 0);

// ── 8. Portfolio-scope insights untouched ─────────────────────────────────

console.log('\n8) Portfolio-scope insights untouched by LOW conf');
const portfolioIns = applyConfidence([ins({ scope: 'portfolio', projectId: 'p1' })], conf);
check('portfolio scope: severity unchanged',      portfolioIns[0].severity === 'critical');
check('portfolio scope: no badge',                !portfolioIns[0].confidence);

// ── 9. Empty inputs ───────────────────────────────────────────────────────

console.log('\n9) Edge: empty inputs');
check('empty insights → []',   applyConfidence([], conf).length === 0);
check('empty confMap → pass-through', applyConfidence([ins()], {}).length === 1 && !applyConfidence([ins()], {})[0].confidence);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
