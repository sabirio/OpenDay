import { useCallback, useEffect, useState } from 'react';
import {
  loadScheduleSubmissionContext,
  submitScheduleAction,
  requestScheduleChangesAction,
  approveScheduleSubmissionAction,
} from '../core/contractorSchedule/scheduleSubmissionOrchestration.js';
import {
  findLatestVersion,
  findPendingVersion,
  findApprovedVersion,
  deriveSubmissionDisplayStatus,
} from '../core/schedule/scheduleSubmissionReadModel.js';
import { canEditDraft, canSubmit, canEditScope, deriveNextBaselineRevisionNumber } from '../core/schedule/contractorScheduleLifecycle.js';

/**
 * Shared submission-lifecycle read model + actions (Simplification Phase
 * 4B.2) — the ONE place both ContractorSchedule.jsx and the PM Review page
 * load lifecycle status, submission history, and derived capabilities/
 * display status. Server remains final authority for every action (Section
 * D/E) — this hook never guesses at outcomes, it always reloads canonical
 * state after a write and on any lifecycle-race error.
 */
export function useScheduleSubmission({ projectId }) {
  const [context, setContext] = useState({ lifecycleStatus: 'DRAFT', versions: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState(null);

  const reload = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const next = await loadScheduleSubmissionContext(projectId);
      setContext(next);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    if (!projectId) { setLoading(false); return undefined; }
    setLoading(true);
    setLoadError(null);
    loadScheduleSubmissionContext(projectId)
      .then((next) => { if (alive) setContext(next); })
      .catch((error) => { if (alive) setLoadError(error); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  const runAction = useCallback(async (actionFn) => {
    setActionPending(true);
    setActionError(null);
    try {
      const outcome = await actionFn();
      if (!outcome.ok) {
        setActionError(outcome.error);
        // Lifecycle-race errors mean another actor already changed the
        // state this action assumed — reload canonical truth rather than
        // leaving the page showing a now-stale status (Section F/S).
        if (outcome.error.shouldReload) await reload();
        return outcome;
      }
      await reload();
      return outcome;
    } finally {
      setActionPending(false);
    }
  }, [reload]);

  const submit = useCallback((comment) => runAction(() => submitScheduleAction(projectId, comment)), [runAction, projectId]);
  const requestChanges = useCallback((submissionId, comment) => runAction(() => requestScheduleChangesAction(submissionId, comment)), [runAction]);
  const approve = useCallback((submissionId, comment) => runAction(() => approveScheduleSubmissionAction(submissionId, comment)), [runAction]);

  const { lifecycleStatus, versions } = context;

  return {
    loading,
    loadError,
    lifecycleStatus,
    displayStatus: deriveSubmissionDisplayStatus(versions),
    versions,
    latestVersion: findLatestVersion(versions),
    pendingVersion: findPendingVersion(versions),
    approvedVersion: findApprovedVersion(versions),
    canEditDraft: canEditDraft(lifecycleStatus),
    canSubmit: canSubmit(lifecycleStatus),
    canEditScope: canEditScope(lifecycleStatus),
    nextBaselineRevisionNumber: deriveNextBaselineRevisionNumber(versions.map((v) => v.baselineRevisionNumber)),
    submit,
    requestChanges,
    approve,
    actionPending,
    actionError,
    reload,
  };
}
