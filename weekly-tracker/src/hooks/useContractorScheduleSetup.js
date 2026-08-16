import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildDefaultScheduleActivities,
  buildScheduleSetupSavePayload,
  validateScheduleSetupActivities,
} from '../domains/workOntology/contractorScheduleSetupModel.js';
import {
  loadContractorScheduleSetup,
  commitContractorScheduleSetup,
} from '../core/contractorSchedule/contractorScheduleSetupOrchestration.js';

export function useContractorScheduleSetup({ projectId, enabled }) {
  const [state, setState] = useState({ key: null, executionScope: null, activities: [], configured: false });
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId || !enabled) return undefined;
    let alive = true;
    loadContractorScheduleSetup(projectId).then(loaded => {
      if (!alive) return;
      const activities = loaded?.configured
        ? loaded.activities
        : loaded?.executionScope
          ? buildDefaultScheduleActivities(loaded.executionScope)
          : [];
      const next = loaded
        ? { key: projectId, ...loaded, activities }
        : { key: projectId, executionScope: null, activities: [], configured: false };
      setState(next);
      setBaseline(JSON.stringify(activities));
      setError(null);
    }).catch(loadError => {
      if (alive) setError(loadError);
    });
    return () => { alive = false; };
  }, [projectId, enabled, reloadKey]);

  const current = state.key === projectId ? state : { executionScope: null, activities: [], configured: false };
  const loading = Boolean(projectId && enabled && state.key !== projectId && !error);
  const issues = useMemo(
    () => current.executionScope
      ? validateScheduleSetupActivities(current.activities, current.executionScope)
      : [{ code: 'EXECUTION_SCOPE_NOT_CONFIGURED' }],
    [current.activities, current.executionScope],
  );
  const dirty = Boolean(current.executionScope)
    && (!current.configured || JSON.stringify(current.activities) !== baseline);

  const updateActivity = useCallback((activityId, patch) => {
    setState(previous => ({
      ...previous,
      activities: previous.activities.map(activity => activity.activityId === activityId
        ? { ...activity, ...patch }
        : activity),
    }));
  }, []);

  const addActivity = useCallback(() => {
    setState(previous => ({
      ...previous,
      activities: [...previous.activities, { activityId: crypto.randomUUID(), title: '', workGroupIds: [] }],
    }));
  }, []);

  const removeActivity = useCallback((activityId) => {
    setState(previous => ({
      ...previous,
      activities: previous.activities.filter(activity => activity.activityId !== activityId),
    }));
  }, []);

  const discard = useCallback(() => {
    setState(previous => ({ ...previous, activities: JSON.parse(baseline || '[]') }));
  }, [baseline]);

  const save = useCallback(async () => {
    const payload = buildScheduleSetupSavePayload(current.activities, current.executionScope);
    setSaving(true);
    setError(null);
    try {
      const result = await commitContractorScheduleSetup(
        projectId,
        current.executionScope.id,
        payload,
      );
      setBaseline(JSON.stringify(current.activities));
      setState(previous => ({ ...previous, configured: true }));
      setRevision(value => value + 1);
      return result;
    } catch (saveError) {
      setError(saveError);
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [current.activities, current.executionScope, projectId]);

  return {
    ...current,
    loading,
    saving,
    error,
    issues,
    dirty,
    revision,
    updateActivity,
    addActivity,
    removeActivity,
    discard,
    save,
    reload: () => setReloadKey(value => value + 1),
  };
}
