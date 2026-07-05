// computeEffectiveWeights.test.mjs — P1.4 scope-reweighting contract.
// Run: node src/core/projects/weights/computeEffectiveWeights.test.mjs
//
// Acceptance criterion under test: removing a phase or a single work package
// from scope must recalculate the REMAINING selected scope back up to 100%
// total weight — a partial scope must never silently sum to less than 1,
// which would make official progress permanently understate reality for any
// project that excludes phases (e.g. no-demolition template).
//
// Zero-dependency: computeEffectiveWeights.js has no imports of its own, and
// masterTaskLibrary.js only imports files with explicit .js extensions, so
// both import directly under plain `node` with no loader needed.

import { computeEffectiveWeights } from './computeEffectiveWeights.js';
import { WORK_PACKAGES, getDefaultPhaseWeights } from '../../../config/masterTaskLibrary.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const EPS = 1e-9;
const sum = (obj) => Object.values(obj).reduce((s, w) => s + w, 0);
const phaseWeights = getDefaultPhaseWeights();

const ALL_WP_IDS = WORK_PACKAGES.map(wp => wp.id);
const demolitionWPIds = WORK_PACKAGES.filter(wp => wp.phaseId === 'demolition').map(wp => wp.id);
const roughInWPIds = WORK_PACKAGES.filter(wp => wp.phaseId === 'rough_in').map(wp => wp.id);

console.log('\nA) Full scope — every WP included');
{
  const result = computeEffectiveWeights(WORK_PACKAGES, ALL_WP_IDS, phaseWeights);
  check('every WP id present in the result', ALL_WP_IDS.every(id => result[id] != null));
  check('weights sum to 1 (full scope)', Math.abs(sum(result) - 1) < EPS);
}

console.log('\nB) Null scope — treated as full scope, no filtering');
{
  const result = computeEffectiveWeights(WORK_PACKAGES, null, phaseWeights);
  check('weights sum to 1 when scopeWPIds is null', Math.abs(sum(result) - 1) < EPS);
}

console.log('\nC) Excluding an entire phase (demolition) reweights the rest to 100%');
{
  const scopedIds = ALL_WP_IDS.filter(id => !demolitionWPIds.includes(id));
  const fullResult = computeEffectiveWeights(WORK_PACKAGES, ALL_WP_IDS, phaseWeights);
  const result = computeEffectiveWeights(WORK_PACKAGES, scopedIds, phaseWeights);

  const fullRoughInTotal = roughInWPIds.reduce((s, id) => s + fullResult[id], 0);
  const partialRoughInTotal = roughInWPIds.reduce((s, id) => s + result[id], 0);

  check('demolition WPs are absent from the result', demolitionWPIds.every(id => result[id] == null));
  check('remaining WPs still sum to 1 (not phaseWeights.demolition-short)', Math.abs(sum(result) - 1) < EPS);
  check("rough_in's share GROWS to absorb demolition's excluded weight (not left at its raw template share)",
    partialRoughInTotal > fullRoughInTotal);
}

console.log('\nD) Excluding one WP within a multi-WP phase redistributes within that phase, phase total unchanged');
{
  const [droppedWpId, ...keptRoughInIds] = roughInWPIds;
  const scopedIds = ALL_WP_IDS.filter(id => id !== droppedWpId);

  const fullResult = computeEffectiveWeights(WORK_PACKAGES, ALL_WP_IDS, phaseWeights);
  const partialResult = computeEffectiveWeights(WORK_PACKAGES, scopedIds, phaseWeights);

  const fullRoughInTotal = roughInWPIds.reduce((s, id) => s + fullResult[id], 0);
  const partialRoughInTotal = keptRoughInIds.reduce((s, id) => s + partialResult[id], 0);

  check('dropped WP is absent from the result', partialResult[droppedWpId] == null);
  check("rough_in phase's total weight is unchanged after dropping one of its WPs (redistributed internally)",
    Math.abs(fullRoughInTotal - partialRoughInTotal) < EPS);
  check('every other phase is completely untouched by a same-phase WP removal', ALL_WP_IDS
    .filter(id => !roughInWPIds.includes(id))
    .every(id => Math.abs(fullResult[id] - partialResult[id]) < EPS));
  check('overall scope still sums to 1 after dropping a single WP', Math.abs(sum(partialResult) - 1) < EPS);
}

console.log('\nE) Empty scope returns an empty weight map, not a divide-by-zero artifact');
{
  const result = computeEffectiveWeights(WORK_PACKAGES, [], phaseWeights);
  check('empty scope -> empty result object', Object.keys(result).length === 0);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
