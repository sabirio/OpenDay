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
import { loadScheduleVersionsForProjects, loadScheduleVersionTasksForVersions } from '../../services/scheduleCommitmentBatchService.js';
import { buildScheduleCommitmentProjection } from '../schedule/scheduleCommitmentBatchProjection.js';
import { isContractorManaged } from '../schedule/scheduleOwnershipMode.js';

/**
 * @param {Array<{id: string|number, scheduleOwnershipMode?: string}>} projects
 * @returns {Promise<Map<string, object>>} see scheduleCommitmentBatchProjection.js for the value shape
 */
export async function loadScheduleCommitmentProjection(projects) {
  const contractorManagedProjects = (projects || []).filter((p) => isContractorManaged(p?.scheduleOwnershipMode));
  if (contractorManagedProjects.length === 0) {
    // AUTO_GENERATED-only project sets never need a fetch at all — the pure
    // projection already returns the same neutral COMMITTED facts for them
    // without reading any rows.
    return buildScheduleCommitmentProjection(projects, [], []);
  }

  const versions = await loadScheduleVersionsForProjects(contractorManagedProjects.map((p) => p.id));
  const approvedVersionIds = versions.filter((v) => v.status === 'APPROVED').map((v) => v.id);
  const versionTasks = await loadScheduleVersionTasksForVersions(approvedVersionIds);

  return buildScheduleCommitmentProjection(projects, versions, versionTasks);
}
