import { useCallback, useEffect, useState } from 'react';
import { loadWeeklyGanttTasks } from '../core/weekly/weeklyGanttSchedule.js';
import { durationDaysFromRange } from './useGanttLayout.js';
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

/**
 * Contractor Draft schedule editing state for one project. Not wired into
 * any route yet (Simplification Phase 3B is foundation only) — reusable
 * primitive for a future Contractor Schedule page.
 *
 * Edits (move/resize/manual date entry) stay in a local buffer
 * (contractorScheduleDraftModel.js) until saveDraft() flushes them in one
 * atomic RPC call. No autosave — see Simplification Phase 3A's save-model
 * recommendation.
 */
export function useContractorScheduleDraft({ projectId }) {
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
  }, [projectId]);

  const persistedTasks = persisted.key === projectId ? persisted.tasks : [];

  // Draft-overlaid view: staged edits win over whatever is currently
  // persisted, so GanttChart renders the contractor's pending changes
  // immediately — but nothing is written until saveDraft().
  const tasks = persistedTasks.map(task => {
    const staged = draft.changesByWpId[task.id];
    if (!staged) return task;
    const earlyStart = new Date(staged.plannedStart);
    const earlyFinish = new Date(staged.plannedEnd);
    return { ...task, earlyStart, earlyFinish, duration_days: durationDaysFromRange(earlyStart, earlyFinish) };
  });

  const stageTaskDates = useCallback((wpId, plannedStart, plannedEnd) => {
    setSaveError(null);
    setDraft(prev => stageTaskDatesPure(prev, wpId, plannedStart, plannedEnd));
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
    stageTaskDates,
    discardTaskChange,
    discardAllChanges,
    saveDraft,
    saving,
    saveError,
  };
}
