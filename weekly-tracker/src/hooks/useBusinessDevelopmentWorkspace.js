import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  commitCommercialOpportunity,
  commitDeliveryEstimate,
  loadBusinessDevelopment,
} from '../core/businessDevelopment/businessDevelopmentOrchestration.js';
import {
  createDeliveryEstimateLine,
  presentEstimateCalculation,
} from '../core/presentation/businessDevelopmentPresentationModel.js';

const ZERO_METRICS = Object.freeze({ opportunities: 0, activeOpportunities: 0, estimates: 0, estimatesInReview: 0, approvedEstimates: 0 });
const EMPTY_WORKSPACE = Object.freeze({ opportunities: [], estimates: [], metrics: ZERO_METRICS });

function messageFromError(error) {
  if (error?.code === 'INVALID_DELIVERY_ESTIMATE' && error.issues?.length) {
    return 'Complete the required estimate fields before saving.';
  }
  if (error?.message?.includes('REVISION_CONFLICT')) return 'This record changed in another session. Refresh and try again.';
  if (error?.code === '42501' || error?.message?.includes('FORBIDDEN')) return 'You do not have permission to update this organization.';
  return 'OpenDay could not save the change. Try again.';
}

export function useBusinessDevelopmentWorkspace(organizationId) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [state, setState] = useState('loading');
  const [resolvedOrganizationId, setResolvedOrganizationId] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async ({ showLoading = true } = {}) => {
    if (!organizationId) {
      setWorkspace(EMPTY_WORKSPACE);
      setResolvedOrganizationId(null);
      setState('ready');
      return EMPTY_WORKSPACE;
    }
    if (showLoading) setState('loading');
    setError(null);
    try {
      const next = await loadBusinessDevelopment(organizationId);
      setWorkspace(next);
      setResolvedOrganizationId(organizationId);
      setState('ready');
      return next;
    } catch (nextError) {
      console.error('[businessDevelopment] workspace load failed', nextError);
      setResolvedOrganizationId(organizationId);
      setError('Business Development data could not be loaded.');
      setState('error');
      return null;
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return undefined;
    let active = true;
    loadBusinessDevelopment(organizationId).then(next => {
      if (!active) return;
      setWorkspace(next);
      setResolvedOrganizationId(organizationId);
      setError(null);
      setState('ready');
    }).catch(nextError => {
      if (!active) return;
      console.error('[businessDevelopment] workspace load failed', nextError);
      setResolvedOrganizationId(organizationId);
      setError('Business Development data could not be loaded.');
      setState('error');
    });
    return () => { active = false; };
  }, [organizationId]);

  const persist = useCallback(async (operation) => {
    setSaving(true);
    setError(null);
    try {
      const result = await operation();
      await refresh({ showLoading: false });
      return result;
    } catch (nextError) {
      console.error('[businessDevelopment] command failed', nextError);
      const friendlyMessage = messageFromError(nextError);
      setError(friendlyMessage);
      throw Object.assign(new Error(friendlyMessage), { cause: nextError });
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const saveOpportunity = useCallback((input) => persist(() => commitCommercialOpportunity(organizationId, input)), [organizationId, persist]);

  const saveEstimate = useCallback((draft) => persist(() => commitDeliveryEstimate(organizationId, draft)), [organizationId, persist]);

  const visibleWorkspace = resolvedOrganizationId === organizationId ? workspace : EMPTY_WORKSPACE;
  const visibleState = !organizationId ? 'ready' : resolvedOrganizationId !== organizationId ? 'loading' : state;
  const metrics = visibleWorkspace.metrics || ZERO_METRICS;

  return {
    workspace: visibleWorkspace,
    metrics,
    state: visibleState,
    error,
    saving,
    refresh,
    saveOpportunity,
    saveEstimate,
    createEstimateItem: createDeliveryEstimateLine,
  };
}

export function useEstimateCalculation(items) {
  return useMemo(() => presentEstimateCalculation(items), [items]);
}
