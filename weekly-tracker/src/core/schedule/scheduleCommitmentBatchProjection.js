// scheduleCommitmentBatchProjection.js — Simplification Phase 3D.1 (live
// approved-commitment projection). Pure composition over already-fetched
// batch rows (scheduleCommitmentBatchService.js) — no Supabase, no React,
// no formulas of its own (the one date-math formula it needs,
// computeEarliestPlannedStart, lives in engines/scheduleLifecycleEngine.js
// per this repository's core-composes-engines architecture guard rule).
//
// Reuses the SAME read-model helpers the single-project Contractor
// Schedule/PM Review pages already use (scheduleSubmissionReadModel.js),
// so "latest version" / "approved version" selection can never silently
// diverge between the single-project and bulk paths.
import { findApprovedVersion, deriveSubmissionDisplayStatus } from './scheduleSubmissionReadModel.js';
import { deriveScheduleCommitmentState, SCHEDULE_COMMITMENT_STATE } from './scheduleCommitmentState.js';
import { SCHEDULE_OWNERSHIP_MODE, isContractorManaged } from './scheduleOwnershipMode.js';
import { computeEarliestPlannedStart } from '../../engines/scheduleLifecycleEngine.js';

// scheduleSubmissionReadModel.js's DISPLAY vocabulary (NONE/PENDING_REVIEW/
// CHANGES_REQUESTED/APPROVED) uses 'NONE' for "never submitted";
// scheduleCommitmentState.js's documented input vocabulary instead expects
// 'DRAFT' for that same case (see scheduleCommitmentState.js's own header
// comment) — this is the one place that translates between them.
function toCommitmentLifecycleStatus(displayStatus) {
  return displayStatus === 'NONE' ? 'DRAFT' : displayStatus;
}

function groupVersionsByProjectId(versions) {
  const map = new Map();
  for (const version of versions) {
    const key = String(version.projectId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(version);
  }
  return map;
}

const NEUTRAL_AUTO_GENERATED_FACTS = Object.freeze({
  lifecycleStatus: null,
  commitmentState: SCHEDULE_COMMITMENT_STATE.COMMITTED,
  approvedVersionId: null,
  approvedAt: null,
  earliestCommittedPlannedStart: null,
  baselineRevisionNumber: null,
});

/**
 * @param {Array<{id: string|number, scheduleOwnershipMode?: string}>} projects
 * @param {Array} versions - ALL project_schedule_versions rows for these
 *   projects, from one batch fetch (loadScheduleVersionsForProjects).
 * @param {Array} versionTasks - project_schedule_version_tasks rows for the
 *   APPROVED version ids among `versions`, from one batch fetch
 *   (loadScheduleVersionTasksForVersions) — safe to pass an empty array;
 *   approvedAt/baselineRevisionNumber are still derived from `versions` alone.
 * @returns {Map<string, {
 *   lifecycleStatus: string|null,
 *   commitmentState: 'NOT_YET_COMMITTED'|'PROPOSED'|'COMMITTED',
 *   approvedVersionId: string|number|null,
 *   approvedAt: string|null,
 *   earliestCommittedPlannedStart: string|null,
 *   baselineRevisionNumber: number|null,
 * }>} keyed by String(project.id)
 */
export function buildScheduleCommitmentProjection(projects, versions = [], versionTasks = []) {
  const versionsByProject = groupVersionsByProjectId(versions);
  const tasksByVersionId = new Map();
  for (const task of versionTasks) {
    const key = String(task.versionId);
    if (!tasksByVersionId.has(key)) tasksByVersionId.set(key, []);
    tasksByVersionId.get(key).push(task);
  }

  const projection = new Map();
  for (const project of projects || []) {
    const projectId = String(project?.id);
    const scheduleOwnershipMode = project?.scheduleOwnershipMode ?? null;

    if (!isContractorManaged(scheduleOwnershipMode)) {
      // AUTO_GENERATED (and any other/missing value) never needs the
      // fetched rows at all — always COMMITTED, matching
      // scheduleCommitmentState.js's own fail-safe default.
      projection.set(projectId, NEUTRAL_AUTO_GENERATED_FACTS);
      continue;
    }

    const projectVersions = versionsByProject.get(projectId) || [];
    const displayStatus = deriveSubmissionDisplayStatus(projectVersions);
    const lifecycleStatus = toCommitmentLifecycleStatus(displayStatus);
    const commitmentState = deriveScheduleCommitmentState({
      scheduleOwnershipMode: SCHEDULE_OWNERSHIP_MODE.CONTRACTOR_MANAGED,
      contractorScheduleLifecycleStatus: lifecycleStatus,
    });

    const approvedVersion = findApprovedVersion(projectVersions);
    const approvedTasks = approvedVersion ? (tasksByVersionId.get(String(approvedVersion.id)) || []) : [];

    projection.set(projectId, {
      lifecycleStatus,
      commitmentState,
      approvedVersionId: approvedVersion?.id ?? null,
      approvedAt: approvedVersion?.reviewedAt ?? null,
      earliestCommittedPlannedStart: approvedVersion ? computeEarliestPlannedStart(approvedTasks) : null,
      baselineRevisionNumber: approvedVersion?.baselineRevisionNumber ?? null,
    });
  }
  return projection;
}
