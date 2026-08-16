// loadScheduleCommitmentProjection.test.mjs — Projection Completeness
// Hardening (Simplification Phase 3D.1 follow-up).
//
// Exercises the REAL orchestration function's error-handling policy via its
// test-only injectable deps seam (never used by any live caller) — no
// Supabase, no network, but the exact same try/catch logic real query
// failures hit. loadScheduleCommitmentProjection.js statically imports
// scheduleCommitmentBatchService.js (for its default deps), which in turn
// statically imports lib/supabase.js — harmless in the real app (Vite
// supplies import.meta.env), but that import must be redirected to a stub
// under plain Node, same lib/supabase interception technique as
// src/tests/siteVisitAtomicService.test.mjs.
import { register } from 'node:module';

function dataUrl(src) { return `data:application/javascript;base64,${Buffer.from(src).toString('base64')}`; }
const mockUrl = dataUrl(`export const supabase = {};`);
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../lib/supabase' && context.parentURL?.endsWith('/services/scheduleCommitmentBatchService.js')) {
    return { url: '${mockUrl}', shortCircuit: true };
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

const { loadScheduleCommitmentProjection } = await import('./loadScheduleCommitmentProjection.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function version({ id, projectId, status, reviewedAt = null, baselineRevisionNumber = null }) {
  return { id, projectId, submissionNumber: 1, status, reviewedAt, baselineRevisionNumber };
}

const failing = () => { throw new Error('simulated query failure'); };

console.log('\nBatch completeness: every requested project receives exactly one explicit result');
{
  const projects = [
    { id: 1, scheduleOwnershipMode: 'AUTO_GENERATED' },
    { id: 2, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }, // no version
    { id: 3, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }, // approved
  ];
  const loadVersions = async () => [version({ id: 'v3', projectId: 3, status: 'APPROVED', reviewedAt: '2027-01-01T00:00:00Z' })];
  const loadVersionTasks = async () => [{ versionId: 'v3', plannedStart: '2027-01-05' }];
  const loadBaselines = async () => [{ projectId: 3, scheduleVersionId: 'v3', baselineRevisionNumber: 1, approvedAt: '2027-01-01T00:00:00Z' }];

  const projection = await loadScheduleCommitmentProjection(projects, { loadVersions, loadVersionTasks, loadBaselines });
  check('projection has exactly one entry per requested project, no more, no fewer', projection.size === 3);
  check('project 1 (AUTO_GENERATED) is AVAILABLE/COMMITTED', projection.get('1').projectionAvailability === 'AVAILABLE' && projection.get('1').commitmentState === 'COMMITTED');
  check('project 2 (no version) is explicit AVAILABLE/DRAFT/NOT_YET_COMMITTED, not just absent', projection.get('2').projectionAvailability === 'AVAILABLE' && projection.get('2').lifecycleStatus === 'DRAFT' && projection.get('2').commitmentState === 'NOT_YET_COMMITTED');
  check('project 3 (approved) is AVAILABLE/COMMITTED', projection.get('3').projectionAvailability === 'AVAILABLE' && projection.get('3').commitmentState === 'COMMITTED');
  check('no unexpected project id appears in the map', [...projection.keys()].sort().join(',') === '1,2,3');
}

console.log('\nNo CONTRACTOR_MANAGED projects at all -> the batch fetch is never even attempted');
{
  let called = false;
  const loadVersions = async () => { called = true; return []; };
  const projects = [{ id: 9, scheduleOwnershipMode: 'AUTO_GENERATED' }];
  const projection = await loadScheduleCommitmentProjection(projects, { loadVersions });
  check('loadVersions was never called (no rows needed at all)', called === false);
  check('AUTO_GENERATED project still gets an explicit AVAILABLE entry', projection.get('9').projectionAvailability === 'AVAILABLE');
}

console.log('\nVersions query failure -> every CONTRACTOR_MANAGED project explicitly UNAVAILABLE, never silently NOT_YET_COMMITTED');
{
  const projects = [
    { id: 10, scheduleOwnershipMode: 'AUTO_GENERATED' },
    { id: 11, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' },
    { id: 12, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' },
  ];
  const projection = await loadScheduleCommitmentProjection(projects, { loadVersions: failing });
  check('every requested project still receives exactly one entry', projection.size === 3);
  check('AUTO_GENERATED project is unaffected (still confidently COMMITTED)', projection.get('10').projectionAvailability === 'AVAILABLE' && projection.get('10').commitmentState === 'COMMITTED');
  check('CONTRACTOR_MANAGED project 11 is explicitly UNAVAILABLE', projection.get('11').projectionAvailability === 'UNAVAILABLE');
  check('CONTRACTOR_MANAGED project 11 commitmentState is null, not NOT_YET_COMMITTED', projection.get('11').commitmentState === null);
  check('CONTRACTOR_MANAGED project 12 is also explicitly UNAVAILABLE', projection.get('12').projectionAvailability === 'UNAVAILABLE');
}

console.log('\nTasks query failure -> only APPROVED projects go UNAVAILABLE; DRAFT/PENDING_REVIEW/CHANGES_REQUESTED stay fully known');
{
  const projects = [
    { id: 20, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }, // no version
    { id: 21, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }, // PENDING_REVIEW
    { id: 22, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }, // CHANGES_REQUESTED
    { id: 23, scheduleOwnershipMode: 'CONTRACTOR_MANAGED' }, // APPROVED — this is the one the failed tasks query affects
  ];
  const loadVersions = async () => [
    version({ id: 'v21', projectId: 21, status: 'PENDING_REVIEW' }),
    version({ id: 'v22', projectId: 22, status: 'CHANGES_REQUESTED' }),
    version({ id: 'v23', projectId: 23, status: 'APPROVED', reviewedAt: '2027-01-01T00:00:00Z' }),
  ];
  const projection = await loadScheduleCommitmentProjection(projects, { loadVersions, loadVersionTasks: failing });

  check('project 20 (no version) is unaffected by the tasks-query failure it never needed', projection.get('20').projectionAvailability === 'AVAILABLE' && projection.get('20').commitmentState === 'NOT_YET_COMMITTED');
  check('project 21 (PENDING_REVIEW) is unaffected — its state never depended on task rows', projection.get('21').projectionAvailability === 'AVAILABLE' && projection.get('21').commitmentState === 'PROPOSED');
  check('project 22 (CHANGES_REQUESTED) is unaffected', projection.get('22').projectionAvailability === 'AVAILABLE' && projection.get('22').commitmentState === 'NOT_YET_COMMITTED');
  check('project 23 (APPROVED) is explicitly UNAVAILABLE — its dates could not be confirmed', projection.get('23').projectionAvailability === 'UNAVAILABLE');
  check('project 23 commitmentState is null, never a fabricated COMMITTED from a failed tasks fetch', projection.get('23').commitmentState === null);
  check('project 23 approvedVersionId is still known (we know WHICH version, just not its dates)', projection.get('23').approvedVersionId === 'v23');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
