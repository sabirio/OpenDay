// scheduleCommitmentBatchService.test.mjs — Projection Completeness
// Hardening (Simplification Phase 3D.1 follow-up).
//
// Proves the REAL, unmodified service functions genuinely throw on a
// Supabase {error} response (the root behavior loadScheduleCommitmentProjection.js's
// try/catch depends on) rather than silently returning an empty array —
// same lib/supabase interception technique as
// src/tests/siteVisitAtomicService.test.mjs (this repo's established
// pattern for testing a real service file without a live Supabase project).
import { register } from 'node:module';

function dataUrl(src) { return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`; }
const mockUrl = dataUrl(`export const supabase = globalThis.__scheduleCommitmentBatchServiceTest.supabase;`);
const loaderSrc = `export async function resolve(s,c,n){if(s==='../lib/supabase'&&c.parentURL?.endsWith('/services/scheduleCommitmentBatchService.js'))return{url:'${mockUrl}',shortCircuit:true};if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/))return n(s+'.js',c);return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// One stable supabase object (captured once at import time by the mocked
// lib/supabase module) whose from() reads the current
// __scheduleCommitmentBatchServiceTest.result fresh on every call — tests
// mutate that property between cases instead of replacing the object
// itself, which a `const supabase = ...` export can't pick up after import.
const state = { result: { data: [], error: null }, called: false };
globalThis.__scheduleCommitmentBatchServiceTest = {
  supabase: {
    from(table) {
      state.called = true;
      state.lastTable = table;
      return { select: () => ({ in: () => Promise.resolve(state.result) }) };
    },
  },
};
const { loadScheduleVersionsForProjects, loadScheduleVersionTasksForVersions } = await import('./scheduleCommitmentBatchService.js');

console.log('\nloadScheduleVersionsForProjects — success and error propagation');
{
  state.result = { data: [{ id: 'v1', project_id: 5, submission_number: 1, baseline_revision_number: null, status: 'PENDING_REVIEW', reviewed_at: null }], error: null };
  const versions = await loadScheduleVersionsForProjects([5]);
  check('maps a successful row to camelCase', versions.length === 1 && versions[0].projectId === 5 && versions[0].status === 'PENDING_REVIEW');

  state.result = { data: null, error: { message: 'simulated RLS/network failure' } };
  let threw = false;
  try { await loadScheduleVersionsForProjects([5]); } catch (e) { threw = e.message === 'simulated RLS/network failure'; }
  check('a Supabase {error} response is THROWN, not silently returned as an empty array', threw);
}

console.log('\nloadScheduleVersionTasksForVersions — success and error propagation');
{
  state.result = { data: [{ version_id: 'v1', planned_start: '2027-01-01' }], error: null };
  const tasks = await loadScheduleVersionTasksForVersions(['v1']);
  check('maps a successful row to camelCase', tasks.length === 1 && tasks[0].versionId === 'v1' && tasks[0].plannedStart === '2027-01-01');

  state.result = { data: null, error: { message: 'simulated tasks-query failure' } };
  let threw = false;
  try { await loadScheduleVersionTasksForVersions(['v1']); } catch (e) { threw = e.message === 'simulated tasks-query failure'; }
  check('a Supabase {error} response is THROWN, not silently returned as an empty array', threw);
}

console.log('\nEmpty id input short-circuits without ever calling Supabase');
{
  state.called = false;
  const versions = await loadScheduleVersionsForProjects([]);
  const tasks = await loadScheduleVersionTasksForVersions([]);
  check('no Supabase call for empty project/version ids', versions.length === 0 && tasks.length === 0 && !state.called);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
