// loadScheduleCommitmentProjection.js — Simplification Phase 3D.1 (live
// approved-commitment projection). Orchestration (I/O) pairing for
// scheduleCommitmentBatchProjection.js (pure), the same way
// scheduleSubmissionOrchestration.js pairs with scheduleSubmissionReadModel.js.
//
// THE one canonical batch loader every bulk consumer (Dashboard/Home/
// WeeklyReports via useAllRows, Contractor Workspace via
// useContractorWorkspace) calls — never one query per project. Two bounded
// queries regardless of how many projects are passed in: all versions for
// the given project ids, then version_tasks only for the APPROVED versions
// found among them.
import { loadScheduleVersionsForProjects, loadScheduleVersionTasksForVersions, loadScheduleBaselinesForProjects } from '../../services/scheduleCommitmentBatchService.js';
import { buildScheduleCommitmentProjection, buildUnavailableProjection } from '../schedule/scheduleCommitmentBatchProjection.js';
import { isContractorManaged } from '../schedule/scheduleOwnershipMode.js';

/**
 * Projection Completeness Hardening: a versions-query failure means nothing
 * — not even DRAFT/PENDING_REVIEW/CHANGES_REQUESTED — is known about any
 * CONTRACTOR_MANAGED project in this batch, so every one of them is marked
 * explicitly UNAVAILABLE (never silently defaulted to a confident
 * NOT_YET_COMMITTED). A tasks-query failure only affects projects with an
 * APPROVED version — passing an empty task list through to
 * buildScheduleCommitmentProjection() lets its own per-project "approved
 * version but zero resolved tasks" check mark exactly those projects
 * UNAVAILABLE, leaving DRAFT/PENDING_REVIEW/CHANGES_REQUESTED projects (which
 * never depended on task rows) fully known and unaffected.
 * @param {Array<{id: string|number, scheduleOwnershipMode?: string}>} projects
 * @param {object} [deps] - test-only seam; defaults to the real Supabase-backed
 *   service functions. Never passed by any live caller.
 * @param {typeof loadScheduleVersionsForProjects} [deps.loadVersions]
 * @param {typeof loadScheduleVersionTasksForVersions} [deps.loadVersionTasks]
 * @returns {Promise<Map<string, object>>} see scheduleCommitmentBatchProjection.js for the value shape
 */
export async function loadScheduleCommitmentProjection(
  projects,
  {
    loadVersions = loadScheduleVersionsForProjects,
    loadVersionTasks = loadScheduleVersionTasksForVersions,
    loadBaselines = loadScheduleBaselinesForProjects,
  } = {},
) {
  const allProjects = projects || [];
  const contractorManagedProjects = allProjects.filter((p) => isContractorManaged(p?.scheduleOwnershipMode));
  if (contractorManagedProjects.length === 0) {
    // AUTO_GENERATED-only project sets never need a fetch at all — the pure
    // projection already returns the same neutral COMMITTED facts for them
    // without reading any rows.
    return buildScheduleCommitmentProjection(allProjects, [], []);
  }

  let versions;
  try {
    versions = await loadVersions(contractorManagedProjects.map((p) => p.id));
  } catch {
    return buildUnavailableProjection(allProjects);
  }

  const approvedVersionIds = versions.filter((v) => v.status === 'APPROVED').map((v) => v.id);
  let versionTasks;
  let baselines;
  try {
    [versionTasks, baselines] = await Promise.all([
      loadVersionTasks(approvedVersionIds),
      loadBaselines(contractorManagedProjects.map((p) => p.id)),
    ]);
  } catch {
    versionTasks = [];
    baselines = [];
  }

  return buildScheduleCommitmentProjection(allProjects, versions, versionTasks, baselines);
}
