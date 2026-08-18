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

// Projection Completeness Hardening (Phase 3D.1 follow-up): a batch fetch
// can fail, or an APPROVED version's immutable snapshot can come back
// incomplete (RLS silently filtering project_schedule_version_tasks while
// project_schedule_versions stays visible, or a genuine data anomaly).
// PROJECTION_AVAILABILITY distinguishes that "we don't actually know" state
// from a genuinely resolved NO_VERSION/DRAFT lookup — the two must never be
// indistinguishable, or a real Approved Baseline could silently read as
// "not yet committed" (suppressing a genuine overdue-report signal) with no
// visible trace of the failure.
export const PROJECTION_AVAILABILITY = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * Every requested project gets this shape when the batch fetch itself could
 * not be trusted (a thrown query error, or an APPROVED version whose
 * immutable task snapshot could not be resolved) — commitmentState is
 * explicitly null, never one of the three real values, so it can never be
 * mistaken for a confirmed NOT_YET_COMMITTED/PROPOSED/COMMITTED verdict by
 * a consumer that forgets to check projectionAvailability first.
 */
function unavailableFacts(approvedVersionId = null) {
  return {
    projectionAvailability: PROJECTION_AVAILABILITY.UNAVAILABLE,
    lifecycleStatus: null,
    commitmentState: null,
    approvedVersionId,
    approvedAt: null,
    earliestCommittedPlannedStart: null,
    baselineRevisionNumber: null,
    executionScopeVersionId: null,
  };
}

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
  projectionAvailability: PROJECTION_AVAILABILITY.AVAILABLE,
  lifecycleStatus: null,
  commitmentState: SCHEDULE_COMMITMENT_STATE.COMMITTED,
  approvedVersionId: null,
  approvedAt: null,
  earliestCommittedPlannedStart: null,
  baselineRevisionNumber: null,
  executionScopeVersionId: null,
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
export function buildScheduleCommitmentProjection(projects, versions = [], versionTasks = [], baselines = null) {
  const versionsByProject = groupVersionsByProjectId(versions);
  const tasksByVersionId = new Map();
  for (const task of versionTasks) {
    const key = String(task.versionId);
    if (!tasksByVersionId.has(key)) tasksByVersionId.set(key, []);
    tasksByVersionId.get(key).push(task);
  }
  const baselineByProjectId = new Map();
  for (const baseline of baselines || []) {
    baselineByProjectId.set(String(baseline.projectId), baseline);
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
    const officialBaseline = baselines === null ? null : baselineByProjectId.get(projectId);

    if (approvedVersion && baselines !== null
      && (!officialBaseline || String(officialBaseline.scheduleVersionId) !== String(approvedVersion.id))) {
      projection.set(projectId, unavailableFacts(approvedVersion.id));
      continue;
    }

    // An APPROVED version's immutable task snapshot is guaranteed to be
    // non-empty by the submission RPC's own invariants (049) — zero rows
    // here means the task fetch failed, was RLS-filtered independently of
    // the version row, or hit a genuine data anomaly. Never derive
    // COMMITTED-with-approvedAt from an incomplete snapshot: that would
    // publish a real-looking commitment fact set built on missing data
    // (the same failure this hardening pass exists to close).
    if (approvedVersion && approvedTasks.length === 0) {
      projection.set(projectId, unavailableFacts(approvedVersion.id));
      continue;
    }

    projection.set(projectId, {
      projectionAvailability: PROJECTION_AVAILABILITY.AVAILABLE,
      lifecycleStatus,
      commitmentState,
      approvedVersionId: approvedVersion?.id ?? null,
      approvedAt: officialBaseline?.approvedAt ?? approvedVersion?.reviewedAt ?? null,
      earliestCommittedPlannedStart: approvedVersion ? computeEarliestPlannedStart(approvedTasks) : null,
      baselineRevisionNumber: officialBaseline?.baselineRevisionNumber ?? approvedVersion?.baselineRevisionNumber ?? null,
      executionScopeVersionId: officialBaseline?.executionScopeVersionId ?? null,
    });
  }
  return projection;
}

/**
 * Produces an explicit UNAVAILABLE entry for every requested
 * CONTRACTOR_MANAGED project — used when the versions query itself failed,
 * so nothing (not even DRAFT/PENDING_REVIEW/CHANGES_REQUESTED) is actually
 * known about any of them. AUTO_GENERATED projects are entirely unaffected
 * (they never depend on this fetch) and still resolve to their normal
 * confident COMMITTED facts.
 * @param {Array<{id: string|number, scheduleOwnershipMode?: string}>} projects
 * @returns {Map<string, object>}
 */
export function buildUnavailableProjection(projects) {
  const projection = new Map();
  for (const project of projects || []) {
    const projectId = String(project?.id);
    projection.set(
      projectId,
      isContractorManaged(project?.scheduleOwnershipMode) ? unavailableFacts() : NEUTRAL_AUTO_GENERATED_FACTS,
    );
  }
  return projection;
}
