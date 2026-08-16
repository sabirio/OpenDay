import { useCallback, useEffect, useState } from 'react';
import { changeCostPackageDraft, changeCostPackageScope, changeMembershipCapability, changeMembershipDraft, changeMembershipPackage, changeTenderPackageDraft, changeTenderPackageScope, commitCostPackage, commitMembership, commitTenderPackage, editCostPackageDraft, editMembershipDraft, editTenderPackageDraft, inspectCostPackageDraft, inspectMembershipDraft, inspectTenderPackageDraft, loadCommercialSetup, startCostPackageDraft, startMembershipDraft, startTenderPackageDraft } from '../core/commercial/commercialFoundationOrchestration.js';

export function useCommercialFoundation(project) {
  const [state, setState] = useState({ status: 'loading', view: null, error: null });
  const [costPackageDraft, setCostPackageDraft] = useState(null);
  const [membershipDraft, setMembershipDraft] = useState(null);
  const [tenderPackageDraft, setTenderPackageDraft] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    if (!project?.id) return;
    setState(current => ({ ...current, status: 'loading', error: null }));
    try { setState({ status: 'ready', view: await loadCommercialSetup(project), error: null }); }
    catch (error) { setState({ status: 'error', view: null, error }); }
  }, [project]);
  useEffect(() => {
    let active = true;
    if (!project?.id) return () => { active = false; };
    loadCommercialSetup(project).then(view => { if (active) setState({ status: 'ready', view, error: null }); }).catch(error => { if (active) setState({ status: 'error', view: null, error }); });
    return () => { active = false; };
  }, [project]);

  const newCostPackage = useCallback(() => setCostPackageDraft(startCostPackageDraft(state.view)), [state.view]);
  const editCostPackage = useCallback(id => setCostPackageDraft(editCostPackageDraft(state.view, id)), [state.view]);
  const patchCostPackage = useCallback(patch => setCostPackageDraft(current => changeCostPackageDraft(current, patch)), []);
  const toggleWorkGroup = useCallback(id => setCostPackageDraft(current => changeCostPackageScope(current, id)), []);
  const saveCostPackageDraft = useCallback(async () => {
    setBusy('cost-package');
    try { const result = await commitCostPackage(project.id, costPackageDraft); await load(); setCostPackageDraft(null); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  }, [costPackageDraft, load, project]);

  const newMembership = useCallback(() => setMembershipDraft(startMembershipDraft(state.view)), [state.view]);
  const editMembership = useCallback(id => setMembershipDraft(editMembershipDraft(state.view, id)), [state.view]);
  const patchMembership = useCallback(patch => setMembershipDraft(current => changeMembershipDraft(state.view, current, patch)), [state.view]);
  const toggleCapability = useCallback(code => setMembershipDraft(current => changeMembershipCapability(current, code)), []);
  const toggleMembershipPackage = useCallback(id => setMembershipDraft(current => changeMembershipPackage(current, id)), []);
  const saveMembershipDraft = useCallback(async () => {
    setBusy('membership');
    try { const result = await commitMembership(project.id, state.view, membershipDraft); await load(); setMembershipDraft(null); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  }, [load, membershipDraft, project, state.view]);

  const newTenderPackage = useCallback(() => setTenderPackageDraft(startTenderPackageDraft(state.view)), [state.view]);
  const editTenderPackage = useCallback(id => setTenderPackageDraft(editTenderPackageDraft(state.view, id)), [state.view]);
  const patchTenderPackage = useCallback(patch => setTenderPackageDraft(current => changeTenderPackageDraft(current, patch)), []);
  const toggleTenderPackageScope = useCallback(id => setTenderPackageDraft(current => changeTenderPackageScope(current, id)), []);
  const saveTenderPackageDraft = useCallback(async () => {
    setBusy('tender-package');
    try { const result = await commitTenderPackage(project.id, state.view, tenderPackageDraft); await load(); setTenderPackageDraft(null); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  }, [load, project, state.view, tenderPackageDraft]);

  return { ...state, costPackageDraft, membershipDraft, tenderPackageDraft, costPackageAssessment: inspectCostPackageDraft(costPackageDraft), membershipAssessment: inspectMembershipDraft(state.view, membershipDraft), tenderPackageAssessment: inspectTenderPackageDraft(state.view, tenderPackageDraft), busy, newCostPackage, editCostPackage, patchCostPackage, toggleWorkGroup, saveCostPackageDraft,
    cancelCostPackage: () => setCostPackageDraft(null), newMembership, editMembership, patchMembership, toggleCapability, toggleMembershipPackage,
    saveMembershipDraft, cancelMembership: () => setMembershipDraft(null), newTenderPackage, editTenderPackage, patchTenderPackage, toggleTenderPackageScope,
    saveTenderPackageDraft, cancelTenderPackage: () => setTenderPackageDraft(null), retry: load };
}
