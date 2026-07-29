// materializeUnscheduledScheduleFromScope.test.mjs — Simplification Phase 2.
//
// The canonical materializer creates unscheduled project_gantt_tasks rows
// for newly-selected scope WPs — no CPM, no Duration/Dependency model, no
// dates decided. It must be idempotent by construction: an existing row
// (scheduled or not) is never re-upserted, only newly-appearing WPs get an
// insert, only re-entering-scope WPs get an is_archived flip, and only
// falling-out-of-scope WPs get archived. This proves "repeated call with
// unchanged scope cannot destroy task data" structurally, not by hoping a
// full-row round-trip happens to reproduce every column byte-for-byte.
//
// Same stub/loader technique as ganttOrchestrationModel.test.mjs — this repo
// has no module-mocking test infra beyond the resolve-hook -> data: URL
// trick, and ganttEngine.js (the real CPM math) is deliberately NOT
// imported/stubbed here, since materializeUnscheduledScheduleFromScope must
// never touch it.

import { register } from 'node:module';

const ganttServiceStub = `
export function upsertGanttTasks(rows) { (globalThis.__matTestUpsertCalls ??= []).push(rows); return Promise.resolve(); }
export function archiveGanttTasks(projectId, ids) { (globalThis.__matTestArchiveCalls ??= []).push(ids); return Promise.resolve(); }
export function unarchiveGanttTasks(projectId, ids) { (globalThis.__matTestUnarchiveCalls ??= []).push(ids); return Promise.resolve(); }
export function fetchProjectForGanttRegeneration() { return Promise.resolve({}); }
export function fetchProjectScheduleOwnershipMode() { return Promise.resolve('AUTO_GENERATED'); }
export function fetchGanttMetricsRawData() { return Promise.resolve({ allTasks: [], allVisits: [], allProjects: [] }); }
export function getProjectGanttFull() { return Promise.resolve(globalThis.__matTestExistingTasks ?? []); }
export function getProjectGantt() { return Promise.resolve([]); }
`;
const projectServiceStub = `
export function updateGanttDates() { return Promise.resolve(); }
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

const { materializeUnscheduledScheduleFromScope } = await import('./ganttOrchestrationModel.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function reset(existingTasks = []) {
  globalThis.__matTestExistingTasks = existingTasks;
  globalThis.__matTestUpsertCalls = [];
  globalThis.__matTestArchiveCalls = [];
  globalThis.__matTestUnarchiveCalls = [];
}

console.log('\nmaterializeUnscheduledScheduleFromScope — fresh project, no existing rows');
{
  reset([]);
  const scopeWPs = [
    { id: 'wp.a', label: 'WP A', phaseId: 'phase1', phaseLabel: 'Phase 1' },
    { id: 'wp.b', label: 'WP B', phaseId: 'phase1', phaseLabel: 'Phase 1' },
    { id: 'wp.c', label: 'WP C', phaseId: 'phase2', phaseLabel: 'Phase 2' },
  ];
  const result = await materializeUnscheduledScheduleFromScope(801, scopeWPs);

  check('upsertGanttTasks called exactly once', globalThis.__matTestUpsertCalls.length === 1);
  const rows = globalThis.__matTestUpsertCalls[0];
  check('one row created per selected WP', rows.length === 3);
  check('every row has planned_start=null', rows.every(r => r.planned_start === null));
  check('every row has planned_end=null', rows.every(r => r.planned_end === null));
  check('every row has duration_days=null', rows.every(r => r.duration_days === null));
  check('every row has is_critical=false, is_blocker=false, float_days=0 (no CPM output)',
    rows.every(r => r.is_critical === false && r.is_blocker === false && r.float_days === 0));
  check('every row is not archived', rows.every(r => r.is_archived === false));
  check('every row status = not_started', rows.every(r => r.status === 'not_started'));
  check('wp_label/phase_id/phase_label carried through from caller-resolved scope', rows[0].wp_label === 'WP A' && rows[0].phase_id === 'phase1');
  check('archiveGanttTasks NOT called (nothing removed)', globalThis.__matTestArchiveCalls.length === 0);
  check('unarchiveGanttTasks NOT called (nothing re-entering)', globalThis.__matTestUnarchiveCalls.length === 0);
  check('returned counts: created=3, unarchived=0, archived=0',
    result.created === 3 && result.unarchived === 0 && result.archived === 0);
}

console.log('\nmaterializeUnscheduledScheduleFromScope — idempotency: unchanged scope, all rows already exist');
{
  const existing = [
    { id: 'wp.a', planned_start: null, is_archived: false },
    { id: 'wp.b', planned_start: null, is_archived: false },
  ];
  reset(existing);
  const scopeWPs = [
    { id: 'wp.a', label: 'WP A' },
    { id: 'wp.b', label: 'WP B' },
  ];
  const result = await materializeUnscheduledScheduleFromScope(802, scopeWPs);

  check('upsertGanttTasks NOT called — no existing row is ever re-upserted', globalThis.__matTestUpsertCalls.length === 0);
  check('archiveGanttTasks NOT called', globalThis.__matTestArchiveCalls.length === 0);
  check('unarchiveGanttTasks NOT called (nothing was archived)', globalThis.__matTestUnarchiveCalls.length === 0);
  check('returned counts all zero — a true no-op', result.created === 0 && result.unarchived === 0 && result.archived === 0);
}

console.log('\nmaterializeUnscheduledScheduleFromScope — existing scheduled/contractor data is never touched');
{
  // A WP that already has a real, contractor-assigned-looking schedule and
  // progress. Re-running materialization with it still in scope must not
  // issue any write that could overwrite this.
  const existing = [
    { id: 'wp.scheduled', planned_start: '2026-09-01', planned_end: '2026-09-10', is_archived: false },
  ];
  reset(existing);
  const scopeWPs = [{ id: 'wp.scheduled', label: 'Already Scheduled WP' }];
  await materializeUnscheduledScheduleFromScope(803, scopeWPs);

  check('no upsert issued for an already-existing WP, scheduled or not', globalThis.__matTestUpsertCalls.length === 0);
  check('no archive/unarchive issued for a WP that is still in scope and not archived',
    globalThis.__matTestArchiveCalls.length === 0 && globalThis.__matTestUnarchiveCalls.length === 0);
}

console.log('\nmaterializeUnscheduledScheduleFromScope — WP removed from scope is archived, not deleted');
{
  const existing = [
    { id: 'wp.keep',   is_archived: false },
    { id: 'wp.remove', is_archived: false },
  ];
  reset(existing);
  const scopeWPs = [{ id: 'wp.keep', label: 'Keep' }]; // wp.remove no longer selected
  const result = await materializeUnscheduledScheduleFromScope(804, scopeWPs);

  check('archiveGanttTasks called once', globalThis.__matTestArchiveCalls.length === 1);
  check('archived exactly the WP that fell out of scope',
    globalThis.__matTestArchiveCalls[0].length === 1 && globalThis.__matTestArchiveCalls[0][0] === 'wp.remove');
  check('the kept WP was not upserted, archived, or unarchived (already exists, still in scope)',
    globalThis.__matTestUpsertCalls.length === 0 && globalThis.__matTestUnarchiveCalls.length === 0);
  check('returned counts: archived=1', result.archived === 1);
}

console.log('\nmaterializeUnscheduledScheduleFromScope — WP re-added to scope is un-archived, not re-created');
{
  const existing = [
    { id: 'wp.readded', is_archived: true },
  ];
  reset(existing);
  const scopeWPs = [{ id: 'wp.readded', label: 'Re-added WP' }];
  const result = await materializeUnscheduledScheduleFromScope(805, scopeWPs);

  check('unarchiveGanttTasks called once with the re-added id',
    globalThis.__matTestUnarchiveCalls.length === 1 && globalThis.__matTestUnarchiveCalls[0].includes('wp.readded'));
  check('no upsert issued for the re-added WP (its prior data, if any, is untouched)',
    globalThis.__matTestUpsertCalls.length === 0);
  check('no archive call (it is entering scope, not leaving)', globalThis.__matTestArchiveCalls.length === 0);
  check('returned counts: unarchived=1', result.unarchived === 1);
}

console.log('\nmaterializeUnscheduledScheduleFromScope — combined: new + existing + re-entering + removed in one call');
{
  const existing = [
    { id: 'wp.existing',  is_archived: false }, // stays in scope, already exists
    { id: 'wp.archived',  is_archived: true },  // re-enters scope
    { id: 'wp.dropped',   is_archived: false }, // falls out of scope
  ];
  reset(existing);
  const scopeWPs = [
    { id: 'wp.brandnew', label: 'Brand New' },
    { id: 'wp.existing',  label: 'Existing' },
    { id: 'wp.archived',  label: 'Re-entering' },
  ];
  const result = await materializeUnscheduledScheduleFromScope(806, scopeWPs);

  check('exactly one new row created (wp.brandnew)',
    globalThis.__matTestUpsertCalls.length === 1 && globalThis.__matTestUpsertCalls[0].length === 1 &&
    globalThis.__matTestUpsertCalls[0][0].wp_id === 'wp.brandnew');
  check('exactly one un-archive (wp.archived)',
    globalThis.__matTestUnarchiveCalls.length === 1 && globalThis.__matTestUnarchiveCalls[0].includes('wp.archived'));
  check('exactly one archive (wp.dropped)',
    globalThis.__matTestArchiveCalls.length === 1 && globalThis.__matTestArchiveCalls[0].includes('wp.dropped'));
  check('returned counts: created=1, unarchived=1, archived=1',
    result.created === 1 && result.unarchived === 1 && result.archived === 1);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
