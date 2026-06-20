import { getDefaultPhaseWeights, getPhasesInOrder, WORK_PACKAGES as GANTT_TASKS } from '../config/masterTaskLibrary.js';
import { calculateProjectProgress } from '../engines/progressEngine.js';

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ─── Fixture ──────────────────────────────────────────────────────────────────
// Pick the first two phases (in canonical order) that have tasks in GANTT_TASKS.

const phasesWithTasks = getPhasesInOrder().filter(p =>
  GANTT_TASKS.some(t => t.phaseId === p.id)
);

assert(phasesWithTasks.length >= 2, 'fixture requires at least 2 phases with tasks');

const phaseA = phasesWithTasks[0];
const phaseB = phasesWithTasks[1];

const tasksA = GANTT_TASKS.filter(t => t.phaseId === phaseA.id);
const tasksB = GANTT_TASKS.filter(t => t.phaseId === phaseB.id);

const wpStatuses = {
  [phaseA.id]: Object.fromEntries(tasksA.map(t => [t.label, { progress: 100, status: 'done'    }])),
  [phaseB.id]: Object.fromEntries(tasksB.map(t => [t.label, { progress: 0,   status: 'pending' }])),
};

// ─── Test 1: getDefaultPhaseWeights ──────────────────────────────────────────

export function test1_getDefaultPhaseWeights() {
  const w1 = getDefaultPhaseWeights();
  const w2 = getDefaultPhaseWeights();
  assert(w1 && typeof w1 === 'object', 'should return an object');
  assert(Object.keys(w1).length > 0, 'should contain phase weights');
  assert(w1 !== w2, 'should return a NEW object each call (shallow copy)');
  // mutating the result must not affect subsequent calls (private map protected)
  const someId = Object.keys(w1)[0];
  w1[someId] = 99999;
  const w3 = getDefaultPhaseWeights();
  assert(w3[someId] !== 99999, 'mutating returned object must not mutate internal weights');
}

// ─── Test 2: null override == default behavior ────────────────────────────────

export function test2_overrideNullEqualsDefault() {
  const a = calculateProjectProgress(wpStatuses, null, null);
  const b = calculateProjectProgress(wpStatuses, null);
  assert(a === b, `null override must equal default behavior: got ${a} vs ${b}`);
}

// ─── Test 3: override shifts overall % in the expected direction ──────────────

export function test3_overrideChangesResult() {
  const def    = calculateProjectProgress(wpStatuses, null, null);
  const heavyA = calculateProjectProgress(wpStatuses, null, { [phaseA.id]: 90, [phaseB.id]: 10 });
  const heavyB = calculateProjectProgress(wpStatuses, null, { [phaseA.id]: 10, [phaseB.id]: 90 });

  assert(heavyA > heavyB,
    `weighting the completed phase must yield higher overall: heavyA=${heavyA}, heavyB=${heavyB}`);
  assert(heavyA >= def && heavyB <= def,
    `default should sit between the two extremes: def=${def}, heavyA=${heavyA}, heavyB=${heavyB}`);
  assert(heavyA <= 100 && heavyB >= 0, 'overall must stay within 0..100');
}

// ─── Test 4: partial override falls back to default for missing phases ─────────

export function test4_partialOverrideFallsBackToDefault() {
  const onlyA = calculateProjectProgress(wpStatuses, null, { [phaseA.id]: 50 });
  assert(typeof onlyA === 'number' && onlyA >= 0 && onlyA <= 100,
    `partial override must compute a valid number, got ${onlyA}`);
}
