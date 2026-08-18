import { useCallback, useEffect, useState } from 'react';
import { closeBiweeklyCommercialReview, commitCommercialCommitment, commitCostPackageForecast, commitVariation, commitVariationEvidence, commitVariationTransition, loadVariationRegister, loadVariationsWithCommercialReview, openBiweeklyCommercialReview, openVariationEvidence } from '../core/variations/variationOrchestration.js';

export function useProjectVariations(projectId, { includeCommercial = true } = {}) {
  const [state, setState] = useState({ status: 'loading', workspace: null, error: null });
  const [busy, setBusy] = useState(null);
  const loadWorkspace = includeCommercial ? loadVariationsWithCommercialReview : loadVariationRegister;

  const load = useCallback(async () => {
    setState(current => ({ ...current, status: 'loading', error: null }));
    try {
      setState({ status: 'ready', workspace: await loadWorkspace(projectId), error: null });
    } catch (error) {
      setState({ status: 'error', workspace: null, error });
    }
  }, [loadWorkspace, projectId]);

  useEffect(() => {
    let active = true;
    loadWorkspace(projectId)
      .then(workspace => { if (active) setState({ status: 'ready', workspace, error: null }); })
      .catch(error => { if (active) setState({ status: 'error', workspace: null, error }); });
    return () => { active = false; };
  }, [loadWorkspace, projectId]);

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
    createCommitment: input => run('create-commitment', () => commitCommercialCommitment(projectId, input, state.workspace?.costPackageFinancials)),
    createCostPackageForecast: input => run('create-cost-package-forecast', () => commitCostPackageForecast(projectId, input, state.workspace?.costPackageFinancials)),
    openEvidence: openVariationEvidence,
  };
}
