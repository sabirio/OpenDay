import { assessCostPackageDraft, assessMembershipDraft, assessTenderPackageDraft, buildCommercialFoundationView, changeStrategyDraft, createNewCostPackageDraft, createNewMembershipDraft, createNewTenderPackageDraft, createStrategyDraft, filterAvailableProjectUsers, getCostPackageCommand, getMembershipCommand, getStrategyCommand, getTenderPackageCommand, inspectStrategyDraft, patchCostPackageDraft, patchMembershipDraft, patchTenderPackageDraft, presentStrategyDraft, selectCostPackageDraft, selectMembershipDraftRecord, selectTenderPackageDraft, toggleCostPackageWorkGroup, toggleTenderCostPackage } from '../../engines/commercialFoundationEngine.js';
import { createClientRequestId } from '../write/writeCommand.js';
import { addProjectTeamMember, createTenderPackage, loadCommercialFoundation, loadProcurementStrategy, loadProjectTeamFoundation, removeProjectTeamMember, saveCostPackage, saveProcurementStrategy, saveTenderPackageIdentity, updateProjectTeamMemberDepartment } from '../../services/commercialFoundationService.js';
import { fetchWorkOntologyVersionById } from '../../services/workOntologyService.js';

export async function loadCommercialSetup(project) {
  if (!project?.workOntologyVersionId) throw Object.assign(new Error('PROJECT_REQUIRES_WORK_ONTOLOGY'), { code: 'PROJECT_REQUIRES_WORK_ONTOLOGY' });
  const [commercial, team, ontology, procurementStrategy] = await Promise.all([
    loadCommercialFoundation(project.id),
    loadProjectTeamFoundation(project.id),
    fetchWorkOntologyVersionById(project.workOntologyVersionId),
    loadProcurementStrategy(project.id),
  ]);
  return buildCommercialFoundationView({ project, commercial, team, ontology, procurementStrategy });
}

export function startProcurementStrategyDraft(view) { return createStrategyDraft(view); }
export function changeProcurementStrategyDraft(draft, sectionCode, procurementMethod) { return changeStrategyDraft(draft, sectionCode, procurementMethod); }
export function inspectProcurementStrategyDraft(draft) { return inspectStrategyDraft(draft); }
export function presentProcurementStrategyDraft(view, draft) { return presentStrategyDraft(view, draft); }
export async function commitProcurementStrategy(projectId, draft) {
  return saveProcurementStrategy(projectId, getStrategyCommand(draft), createClientRequestId());
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

export function startMembershipDraft(view, membershipId = null) { return createNewMembershipDraft(view, membershipId); }
export function presentMembershipDraft(view, draft) { return selectMembershipDraftRecord(view, draft); }
export function findMembershipCandidates(view, query) { return filterAvailableProjectUsers(view, query); }
export function changeMembershipDraft(draft, patch) { return patchMembershipDraft(draft, patch); }
export function inspectMembershipDraft(view, draft) { return assessMembershipDraft(view, draft); }
export async function commitMembership(projectId, view, draft) {
  const payload = getMembershipCommand(view, draft);
  return payload.membershipId
    ? updateProjectTeamMemberDepartment(projectId, payload, createClientRequestId())
    : addProjectTeamMember(projectId, payload, createClientRequestId());
}
export async function removeMembership(projectId, membership) {
  return removeProjectTeamMember(projectId, membership.membershipId, membership.revision, createClientRequestId());
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
