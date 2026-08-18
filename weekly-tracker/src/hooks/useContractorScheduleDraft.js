import { useCallback, useEffect, useState } from 'react';
import { loadWeeklyGanttTasks } from '../core/weekly/weeklyGanttSchedule.js';
import { durationDaysFromRange, toHumanFinishInclusive, toInternalEndBoundary } from './useGanttLayout.js';
import {
  createEmptyDraftState,
  stageTaskDates as stageTaskDatesPure,
  discardTaskChange as discardTaskChangePure,
  discardAllChanges as discardAllChangesPure,
  isDirty,
  changedTaskCount,
  reconcileAfterSave,
} from '../core/contractorSchedule/contractorScheduleDraftModel.js';
import { saveContractorScheduleDraftFromState } from '../core/contractorSchedule/saveContractorScheduleDraft.js';
import { deriveScheduleCompleteness } from '../core/schedule/contractorScheduleLifecycle.js';

/**
 * Contractor Draft schedule editing state for one project. Not wired into
 * any route yet (Simplification Phase 3B is foundation only) — reusable
 * primitive for a future Contractor Schedule page.
 *
 * Edits (move/resize/manual date entry) stay in a local buffer
 * (contractorScheduleDraftModel.js) until saveDraft() flushes them in one
 * atomic RPC call. No autosave — see Simplification Phase 3A's save-model
 * recommendation.
 *
 * Human-inclusive Finish (Simplification Phase 3B.1): GanttChart.jsx always
 * emits/accepts the internal exclusive planned_end boundary in its own
 * callback contract (unchanged, shared with the PM/AUTO_GENERATED path).
 * This hook is the one place that gets converted to/from the draft
 * buffer's human-inclusive plannedFinish (matching what
 * save_contractor_schedule_draft's RPC contract expects) — see
 * stageTaskDates below for the write direction and the `tasks` merge above
 * for the read direction. Neither GanttChart.jsx nor the pure draft model
 * ever performs this conversion themselves.
 */
export function useContractorScheduleDraft({ projectId, refreshKey = 0 }) {
  const [persisted, setPersisted] = useState({ key: null, tasks: [] });
  const [draft, setDraft] = useState(createEmptyDraftState());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    loadWeeklyGanttTasks(projectId)
      .then(tasks => { if (alive) setPersisted({ key: projectId, tasks }); })
      .catch(() => { if (alive) setPersisted({ key: projectId, tasks: [] }); });
    return () => { alive = false; };
  }, [projectId, refreshKey]);

  const persistedTasks = persisted.key === projectId ? persisted.tasks : [];

  // Draft-overlaid view: staged edits win over whatever is currently
  // persisted, so GanttChart renders the contractor's pending changes
  // immediately — but nothing is written until saveDraft(). The buffer
  // stores plannedFinish as human-inclusive; bar geometry needs the
  // internal exclusive boundary, so toInternalEndBoundary() converts back
  // here — the read-direction half of the one canonical adapter.
  const tasks = persistedTasks.map(task => {
    const staged = draft.changesByWpId[task.id];
    if (!staged) return task;
    const earlyStart = new Date(staged.plannedStart);
    const earlyFinish = toInternalEndBoundary(new Date(staged.plannedFinish));
    return { ...task, earlyStart, earlyFinish, duration_days: durationDaysFromRange(earlyStart, earlyFinish) };
  });

  // GanttChart's own callback contract (onWPResize/onWPMove/
  // onManualDateChange) always emits {plannedStart, plannedEnd} in the
  // INTERNAL exclusive boundary — unchanged for PM/AUTO_GENERATED, uniform
  // regardless of which interaction produced it. This is the one place
  // that gets converted to the buffer's human-inclusive plannedFinish, via
  // the one canonical engine adapter — never duplicated elsewhere.
  const stageTaskDates = useCallback((wpId, { plannedStart, plannedEnd }) => {
    setSaveError(null);
    const plannedFinish = toHumanFinishInclusive(new Date(plannedEnd));
    setDraft(prev => stageTaskDatesPure(prev, wpId, plannedStart, plannedFinish.toISOString().split('T')[0]));
  }, []);

  const discardTaskChange = useCallback((wpId) => {
    setDraft(prev => discardTaskChangePure(prev, wpId));
  }, []);

  const discardAllChanges = useCallback(() => {
    setDraft(discardAllChangesPure());
    setSaveError(null);
  }, []);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveContractorScheduleDraftFromState(projectId, draft);
      // Success: pull the saved dates into the persisted view and clear
      // exactly the changes that were saved — DB is now the atomic-write
      // source of truth for those WPs, so re-fetch rather than trust the
      // local optimistic merge for anything beyond this reconcile.
      const refreshed = await loadWeeklyGanttTasks(projectId);
      setPersisted({ key: projectId, tasks: refreshed });
      setDraft(prev => reconcileAfterSave(prev, result.wpIds));
      return result;
    } catch (error) {
      // Atomic RPC: a thrown error means nothing was persisted. Local draft
      // edits are deliberately NOT cleared here.
      setSaveError(error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [projectId, draft]);

  return {
    tasks,
    dirty: isDirty(draft),
    changedCount: changedTaskCount(draft),
    // Live feedback as the Contractor stages edits (before Save Draft) — the
    // Submit gate additionally requires !dirty, so by the time Submit is
    // actually enabled this always reflects the persisted state (Phase
    // 4B.2 Section E: completeness is one formula, never re-derived per page).
    completeness: deriveScheduleCompleteness(tasks),
    stageTaskDates,
    discardTaskChange,
    discardAllChanges,
    saveDraft,
    saving,
    saveError,
  };
}
