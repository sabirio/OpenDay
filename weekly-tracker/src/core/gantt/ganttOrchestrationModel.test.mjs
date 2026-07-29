// ganttOrchestrationModel.test.mjs — engine-audit regression (2026-07-16):
// regenerateGantt() computed a real projectedOpeningDate from the (real,
// unmocked) ganttEngine on every call, but discarded it via destructuring
// and never passed forecastOpeningDate to updateGanttDates(). Since
// updateGanttDates() only patches a column when its key is present, this
// meant forecast_opening_date silently kept whatever value the last full
// generateAndSaveGantt() wrote, forever — even after a routine scope/date
// edit that regenerates the whole schedule.
//
// ganttOrchestrationModel.js has real Supabase I/O (ganttService.js,
// projectService.js) and this repo has no module-mocking test infra
// (mock.module needs `node --test`, which this repo's plain-script runner
// doesn't use). Stubs the two service modules via the same resolve-hook ->
// data: URL technique already used for the loader itself everywhere else in
// this test suite — ganttEngine.js itself (the real math) is NOT mocked.

import { register } from 'node:module';

const ganttServiceStub = `
export function upsertGanttTasks(rows) { (globalThis.__ganttTestUpsertCalls ??= []).push(rows); return Promise.resolve(); }
export function archiveGanttTasks(projectId, ids) { (globalThis.__ganttTestArchiveCalls ??= []).push(ids); return Promise.resolve(); }
export function unarchiveGanttTasks(projectId, ids) { (globalThis.__ganttTestUnarchiveCalls ??= []).push(ids); return Promise.resolve(); }
export function fetchProjectForGanttRegeneration() { return Promise.resolve(globalThis.__ganttTestProject); }
export function fetchGanttMetricsRawData() { return Promise.resolve({ allTasks: [], allVisits: [], allProjects: [] }); }
export function getProjectGanttFull() { return Promise.resolve([]); }
export function getProjectGantt() { return Promise.resolve([]); }
`;
const projectServiceStub = `
export function updateGanttDates(projectId, patch) { (globalThis.__ganttTestDatePatches ??= []).push(patch); return Promise.resolve(); }
`;

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('services/ganttService')) {
    return { url: 'data:application/javascript,' + encodeURIComponent(${JSON.stringify(ganttServiceStub)}), shortCircuit: true };
  }
  if (specifier.includes('services/projectService')) {
    return { url: 'data:application/javascript,' + encodeURIComponent(${JSON.stringify(projectServiceStub)}), shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      return nextResolve(specifier + '/index.js', context);
    }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { regenerateGantt } = await import('./ganttOrchestrationModel.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const V1_PROJECT = {
  id: 700,
  template_type: null,
  scope: null,
  store_size_sqm: 1000,
  construction_start_date: '2026-01-01',
  construction_end_date: '2026-06-30',
  target_opening_date: '2026-07-15',
};

console.log('\nregenerateGantt — forecastOpeningDate regression (v1)');
{
  globalThis.__ganttTestProject = V1_PROJECT;
  globalThis.__ganttTestDatePatches = [];

  await regenerateGantt(700);

  const patches = globalThis.__ganttTestDatePatches;
  check('updateGanttDates was called exactly once', patches.length === 1);
  const patch = patches[0];
  check('forecastOpeningDate key is present (was previously omitted entirely)',
    Object.prototype.hasOwnProperty.call(patch, 'forecastOpeningDate'));
  check('forecastOpeningDate is a real computed date, not null',
    typeof patch.forecastOpeningDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(patch.forecastOpeningDate));
  check('constructionCompletionDate is still present (was never broken)',
    Object.prototype.hasOwnProperty.call(patch, 'constructionCompletionDate') && patch.constructionCompletionDate !== null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
