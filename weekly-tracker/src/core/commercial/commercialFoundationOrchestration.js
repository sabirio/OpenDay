import { assessCostPackageDraft, assessMembershipDraft, assessTenderPackageDraft, buildCommercialFoundationView, createNewCostPackageDraft, createNewMembershipDraft, createNewTenderPackageDraft, getCostPackageCommand, getMembershipCommand, getTenderPackageCommand, patchCostPackageDraft, patchMembershipDraft, patchTenderPackageDraft, selectCostPackageDraft, selectMembershipDraft, selectTenderPackageDraft, toggleCostPackageWorkGroup, toggleMembershipCapability, toggleMembershipCostPackage, toggleTenderCostPackage } from '../../engines/commercialFoundationEngine.js';
import { createClientRequestId } from '../write/writeCommand.js';
import { createTenderPackage, loadCommercialFoundation, loadProjectTeamFoundation, saveCostPackage, saveProjectTeamMembership, saveTenderPackageIdentity } from '../../services/commercialFoundationService.js';
import { fetchWorkOntologyVersionById } from '../../services/workOntologyService.js';

export async function loadCommercialSetup(project) {
  if (!project?.workOntologyVersionId) throw Object.assign(new Error('PROJECT_REQUIRES_WORK_ONTOLOGY'), { code: 'PROJECT_REQUIRES_WORK_ONTOLOGY' });
  const [commercial, team, ontology] = await Promise.all([
    loadCommercialFoundation(project.id),
    loadProjectTeamFoundation(project.id),
    fetchWorkOntologyVersionById(project.workOntologyVersionId),
  ]);
  return buildCommercialFoundationView({ project, commercial, team, ontology });
}

export function startCostPackageDraft(view) {
  return createNewCostPackageDraft(view, createClientRequestId());
}
export function editCostPackageDraft(view, id) { return selectCostPackageDraft(view, id); }
export function changeCostPackageDraft(draft, patch) { return patchCostPackageDraft(draft, patch); }
export function changeCostPackageScope(draft, id) { return toggleCostPackageWorkGroup(draft, id); }
export function inspectCostPackageDraft(draft) { return assessCostPackageDraft(draft); }
export async function commitCostPackage(projectId, draft) {
  return saveCostPackage(projectId, getCostPackageCommand(draft), createClientRequestId());
}

export function startMembershipDraft(view) {
  return createNewMembershipDraft(view, createClientRequestId(), new Date().toISOString().slice(0, 10));
}
export function editMembershipDraft(view, id) { return selectMembershipDraft(view, id); }
export function changeMembershipDraft(view, draft, patch) { return patchMembershipDraft(view, draft, patch); }
export function changeMembershipCapability(draft, code) { return toggleMembershipCapability(draft, code); }
export function changeMembershipPackage(draft, id) { return toggleMembershipCostPackage(draft, id); }
export function inspectMembershipDraft(view, draft) { return assessMembershipDraft(view, draft); }
export async function commitMembership(projectId, view, draft) {
  return saveProjectTeamMembership(projectId, getMembershipCommand(view, draft), createClientRequestId());
}

export function startTenderPackageDraft(view) { return createNewTenderPackageDraft(view, createClientRequestId()); }
export function editTenderPackageDraft(view, id) { return selectTenderPackageDraft(view, id); }
export function changeTenderPackageDraft(draft, patch) { return patchTenderPackageDraft(draft, patch); }
export function changeTenderPackageScope(draft, id) { return toggleTenderCostPackage(draft, id); }
export function inspectTenderPackageDraft(view, draft) { return assessTenderPackageDraft(view, draft); }
export async function commitTenderPackage(projectId, view, draft) {
  const payload = getTenderPackageCommand(view, draft);
  return payload.expectedRevision === 0 ? createTenderPackage(projectId, payload, createClientRequestId()) : saveTenderPackageIdentity(payload, createClientRequestId());
}
