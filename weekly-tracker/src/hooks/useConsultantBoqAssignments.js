import { useCallback, useEffect, useState } from 'react';
import { loadConsultantAssignmentsView } from '../core/commercial/consultantBoqOrchestration.js';

export function useConsultantBoqAssignments() {
  const [state, setState] = useState({ status: 'loading', assignments: [], error: null });
  const load = useCallback(async () => {
    setState(current => ({ ...current, status: 'loading', error: null }));
    try { setState({ status: 'ready', assignments: await loadConsultantAssignmentsView(), error: null }); }
    catch (error) { setState({ status: 'error', assignments: [], error }); }
  }, []);
  useEffect(() => {
    let active = true;
    loadConsultantAssignmentsView().then(assignments => { if (active) setState({ status: 'ready', assignments, error: null }); }).catch(error => { if (active) setState({ status: 'error', assignments: [], error }); });
    return () => { active = false; };
  }, []);
  return { ...state, retry: load };
}
