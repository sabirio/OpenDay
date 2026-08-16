import { useCallback, useEffect, useState } from 'react';
import { closeBiweeklyCommercialReview, commitCommercialCommitment, commitCommercialHealthSettings, commitCostForecast, commitCostPackageForecast, commitVariation, commitVariationEvidence, commitVariationTransition, loadVariationsWithCommercialReview, openBiweeklyCommercialReview, openVariationEvidence } from '../core/variations/variationOrchestration.js';

export function useProjectVariations(projectId) {
  const [state, setState] = useState({ status: 'loading', workspace: null, error: null });
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setState(current => ({ ...current, status: 'loading', error: null }));
    try {
      setState({ status: 'ready', workspace: await loadVariationsWithCommercialReview(projectId), error: null });
    } catch (error) {
      setState({ status: 'error', workspace: null, error });
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    loadVariationsWithCommercialReview(projectId)
      .then(workspace => { if (active) setState({ status: 'ready', workspace, error: null }); })
      .catch(error => { if (active) setState({ status: 'error', workspace: null, error }); });
    return () => { active = false; };
  }, [projectId]);

  const run = async (key, command) => {
    setBusy(key);
    try {
      const result = await command();
      await load();
      return result;
    } finally {
      setBusy(null);
    }
  };

  return {
    ...state,
    busy,
    retry: load,
    save: draft => run('save', () => commitVariation(projectId, draft)),
    transition: (id, input) => run(`transition-${id}`, () => commitVariationTransition(id, input)),
    upload: (id, file, note) => run(`evidence-${id}`, () => commitVariationEvidence(id, file, note)),
    openReview: () => run('open-review', () => openBiweeklyCommercialReview(projectId)),
    closeReview: (id, note) => run('close-review', () => closeBiweeklyCommercialReview(id, note)),
    createForecast: input => run('create-forecast', () => commitCostForecast(projectId, input)),
    createCommitment: input => run('create-commitment', () => commitCommercialCommitment(projectId, input, state.workspace?.costPackageFinancials)),
    createCostPackageForecast: input => run('create-cost-package-forecast', () => commitCostPackageForecast(projectId, input, state.workspace?.costPackageFinancials)),
    saveHealthSettings: input => run('health-settings', () => commitCommercialHealthSettings(input)),
    openEvidence: openVariationEvidence,
  };
}
