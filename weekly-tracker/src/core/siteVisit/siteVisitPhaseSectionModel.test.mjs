import assert from 'node:assert/strict';
import { buildSiteVisitPhaseSectionModel } from './siteVisitPhaseSectionModel.js';

let passed = 0;
const check = (n, f) => { f(); passed++; console.log(`  PASS ${n}`); };

const tasks = [
  { id: 'a', status: 'completed', actual_progress: 100 },
  { id: 'b', status: 'in_progress', actual_progress: 40 },
];

check('no PM observations yet -> falls back to GC-reported progress (average of 100 and 40)', () => {
  assert.deepEqual(buildSiteVisitPhaseSectionModel(tasks, {}), { phasePct: 70, allComplete: false });
});

check('PM override on the in-progress task raises the average without touching the completed one', () => {
  const obs = { b: { observed_status: 'in_progress', observed_progress: 60 } };
  assert.deepEqual(buildSiteVisitPhaseSectionModel(tasks, obs), { phasePct: 80, allComplete: false });
});

check('PM confirms every task complete -> allComplete true', () => {
  const obs = { b: { observed_status: 'completed', observed_progress: 100 } };
  assert.deepEqual(buildSiteVisitPhaseSectionModel(tasks, obs), { phasePct: 100, allComplete: true });
});

check('GC already reported every task complete, PM has not touched anything -> still allComplete (evidence already present)', () => {
  const allDone = [{ id: 'a', status: 'completed', actual_progress: 100 }, { id: 'c', status: 'completed', actual_progress: 100 }];
  assert.deepEqual(buildSiteVisitPhaseSectionModel(allDone, {}), { phasePct: 100, allComplete: true });
});

check('null/undefined pmWpObservations does not throw', () => {
  assert.deepEqual(buildSiteVisitPhaseSectionModel(tasks, undefined), { phasePct: 70, allComplete: false });
});

check('an observation entry with observed_progress null falls back to GC progress, not 0', () => {
  const obs = { b: { observed_status: 'in_progress', observed_progress: null } };
  assert.deepEqual(buildSiteVisitPhaseSectionModel(tasks, obs), { phasePct: 70, allComplete: false });
});

console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
