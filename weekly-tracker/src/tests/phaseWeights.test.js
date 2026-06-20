import { classifyPhases } from '../engines/progressDeltaEngine.js';

function assert(condition, msg) { if (!condition) throw new Error(msg); }

// Synthetic phases (isolated from config shape). phasePct reads wp.tasks[].name.
const PHASES = [
  { id: 'demolition', name: 'Demolition', tasks: [{ name: 'Strip Out', weight: 1 }] },
  { id: 'rough_in',   name: 'Rough-In',   tasks: [{ name: 'Framing',   weight: 1 }] },
  { id: 'finishes',   name: 'Finishes',   tasks: [{ name: 'Paint',     weight: 1 }] },
];
// minimal statuses so phases classify without error
const statuses = {
  demolition: { 'Strip Out': { status: 'Completed',   progress: 100 } },
  rough_in:   { 'Framing':   { status: 'In Progress', progress: 50  } },
  finishes:   { 'Paint':     { status: 'Not Started', progress: 0   } },
};

export function test1_attachesDefaultWeights() {
  // No phaseWeights passed → engine falls back to getDefaultPhaseWeights().
  const result = classifyPhases(PHASES, statuses, null, null);
  for (const p of result) {
    assert('weight' in p, `phase ${p.id} must have a weight field`);
    assert(p.weight === null || typeof p.weight === 'number',
      `phase ${p.id} weight must be number or null, got ${typeof p.weight}`);
  }
}

export function test2_resolvedWeightsArePassedThrough() {
  // Explicit resolved map must override defaults verbatim.
  const phaseWeights = { demolition: 20, rough_in: 50, finishes: 30 };
  const result = classifyPhases(PHASES, statuses, null, null, phaseWeights);
  const byId = Object.fromEntries(result.map(p => [p.id, p]));
  assert(byId.demolition.weight === 20, `demolition: expected 20, got ${byId.demolition.weight}`);
  assert(byId.rough_in.weight   === 50, `rough_in: expected 50, got ${byId.rough_in.weight}`);
  assert(byId.finishes.weight   === 30, `finishes: expected 30, got ${byId.finishes.weight}`);
}

export function test3_outOfScopeStillCarriesWeightField() {
  // Mark 'finishes' out of scope → weight field must still exist (number or null).
  const scopePhaseIds = ['demolition', 'rough_in'];
  const result = classifyPhases(PHASES, statuses, null, scopePhaseIds, { demolition: 40, rough_in: 60 });
  const oos = result.find(p => p.status === 'out_of_scope');
  assert(oos, 'expected one out_of_scope phase');
  assert('weight' in oos, 'out_of_scope phase must still carry a weight field');
}
