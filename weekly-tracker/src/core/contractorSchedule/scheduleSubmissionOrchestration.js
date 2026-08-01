// Orchestration (I/O) for the Contractor Schedule Submission -> PM Review ->
// Approved Baseline lifecycle (Simplification Phase 4B.2). Pairs with
// scheduleSubmissionReadModel.js (pure) the same way
// saveContractorScheduleDraft.js pairs with contractorScheduleDraftModel.js.
import { createClientRequestId } from '../write/writeCommand.js';
import { normalizeScheduleSubmissionActionError } from '../schedule/contractorScheduleLifecycle.js';
import {
  loadScheduleVersions,
  loadScheduleLifecycleStatus,
  loadScheduleVersionTasks,
  submitSchedule,
  requestScheduleChanges,
  approveScheduleSubmission,
} from '../../services/scheduleSubmissionService.js';
import { getProjectGanttFull } from '../../services/ganttService.js';

/**
 * Everything a page needs to render lifecycle state: the canonical
 * capability status plus the full submission history, loaded together so a
 * caller never has to sequence two round-trips itself.
 * @param {string|number} projectId
 * @returns {Promise<{ lifecycleStatus: string, versions: Array }>}
 */
export async function loadScheduleSubmissionContext(projectId) {
  if (!projectId) return { lifecycleStatus: 'DRAFT', versions: [] };
  const [lifecycleStatus, versions] = await Promise.all([
    loadScheduleLifecycleStatus(projectId),
    loadScheduleVersions(projectId),
  ]);
  return { lifecycleStatus, versions };
}

/**
 * Immutable per-WP snapshot for one submission, shaped for GanttChart's
 * readOnly mode. Dates/duration ALWAYS come from
 * project_schedule_version_tasks (the frozen snapshot) — never from
 * project_gantt_tasks (Phase 4B.2 Section G: "Do not accidentally display a
 * moving Draft as the submitted schedule"). project_gantt_tasks is
 * consulted ONLY to enrich the row with its current wp_label/phaseId/
 * phaseLabel for display — cosmetic identity, not schedule data — using
 * getProjectGanttFull() (includes archived) so a WP archived after
 * submission still resolves a label instead of falling back to its raw id.
 * @param {string|number} projectId
 * @param {string|number} versionId
 * @returns {Promise<Array<{id: string, label: string, phaseId: string, phaseLabel: string, duration_days: number, earlyStart: Date, earlyFinish: Date, lateStart: null, lateFinish: null}>>}
 */
export async function loadSubmissionSnapshot(projectId, versionId) {
  const [snapshotTasks, liveTasks] = await Promise.all([
    loadScheduleVersionTasks(versionId),
    getProjectGanttFull(projectId),
  ]);
  const labelByWpId = new Map(liveTasks.map((t) => [t.id, t]));
  return snapshotTasks.map((task) => {
    const live = labelByWpId.get(task.id);
    return {
      id: task.id,
      label: live?.label || task.id,
      phaseId: live?.phaseId || null,
      phaseLabel: live?.phaseLabel || null,
      duration_days: task.durationDays,
      earlyStart: new Date(task.plannedStart),
      earlyFinish: new Date(task.plannedEnd),
      lateStart: null,
      lateFinish: null,
    };
  });
}

/**
 * One click = one clientRequestId = one submit_contractor_schedule RPC call
 * (Phase 4B.2 Section E — "must produce exactly one submit_contractor_schedule
 * RPC with one clientRequestId"). Errors are normalized into a stable,
 * UI-ready shape — never re-thrown as a raw Postgres error.
 * @param {string|number} projectId
 * @param {string} [comment]
 * @returns {Promise<{ ok: true, result: object } | { ok: false, error: { code: string, message: string, shouldReload: boolean } }>}
 */
export async function submitScheduleAction(projectId, comment) {
  const clientRequestId = createClientRequestId();
  try {
    const result = await submitSchedule(projectId, clientRequestId, comment);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: normalizeScheduleSubmissionActionError(error) };
  }
}

export async function requestScheduleChangesAction(submissionId, comment) {
  const clientRequestId = createClientRequestId();
  try {
    const result = await requestScheduleChanges(submissionId, comment, clientRequestId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: normalizeScheduleSubmissionActionError(error) };
  }
}

export async function approveScheduleSubmissionAction(submissionId, comment) {
  const clientRequestId = createClientRequestId();
  try {
    const result = await approveScheduleSubmission(submissionId, comment, clientRequestId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: normalizeScheduleSubmissionActionError(error) };
  }
}
