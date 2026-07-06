// buildWeightAuditModel.test.mjs — architecture-conformance pin.
// Run: node src/core/projects/weights/buildWeightAuditModel.test.mjs
//
// Extracted verbatim from WeightAudit.jsx's local buildAudit() (V3 audit
// follow-up to F1/F2/F3). Values below were captured from the pre-refactor
// page logic before the move — this test proves the extraction is
// byte-identical, not a logic change.
//
// Zero-dependency chain: computeEffectiveWeights.js and validateTemplate.js
// have no imports needing the extensionless-loader trick, so this resolves
// under plain `node`.

import { buildWeightAuditModel } from './buildWeightAuditModel.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const template = {
  phases: [
    { id: 'p1', progressWeight: 30 },
    { id: 'p2', progressWeight: 70 },
  ],
  workPackages: [
    { id: 'a', phaseId: 'p1', duration_pct: 50 },
    { id: 'b', phaseId: 'p1', duration_pct: 50 },
    { id: 'c', phaseId: 'p2', duration_pct: 100 },
  ],
};
const phaseLabels = { p1: 'Phase One', p2: 'Phase Two' };
const wpLabels = { a: 'A', b: 'B', c: 'C' };

console.log('\nbuildWeightAuditModel — full scope');
{
  const m = buildWeightAuditModel(template, null, phaseLabels, wpLabels);
  check('effectiveSum pins to 1', m.effectiveSum === 1);
  check('phase progressWeightPct pins to 30/70', m.phases[0].progressWeightPct === 30 && m.phases[1].progressWeightPct === 70);
  check('WP a/b split the phase 50/50 -> effectiveWeight 0.15 each', m.phases[0].wps[0].effectiveWeight === 0.15 && m.phases[0].wps[1].effectiveWeight === 0.15);
  check('WP c takes the whole phase weight -> effectiveWeight 0.7', m.phases[1].wps[0].effectiveWeight === 0.7);
  check('all WPs in scope when scopeWPIds is null', m.phases.every(p => p.wps.every(wp => wp.inScope === true)));
  check('no excluded WPs in full scope', m.excludedWPs.length === 0);
  check('labels resolved from the passed-in maps', m.phases[0].label === 'Phase One' && m.phases[0].wps[0].label === 'A');
}

console.log('\nbuildWeightAuditModel — scoped (excludes WP b)');
{
  const m = buildWeightAuditModel(template, ['a', 'c'], phaseLabels, wpLabels);
  check('excluding b re-normalizes a to the full phase weight (0.3)', m.phases[0].wps[0].effectiveWeight === 0.3);
  check('excluded WP b has effectiveWeight 0 and inScope false', m.phases[0].wps[1].effectiveWeight === 0 && m.phases[0].wps[1].inScope === false);
  check('effectiveSum still pins to 1 after re-normalization', m.effectiveSum === 1);
  check('excludedWPs lists b with its label', m.excludedWPs.length === 1 && m.excludedWPs[0].id === 'b' && m.excludedWPs[0].label === 'B');
}

console.log('\nbuildWeightAuditModel — null template');
{
  check('null template -> null model', buildWeightAuditModel(null, null, phaseLabels, wpLabels) === null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
