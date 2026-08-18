import { assignBudgetDisciplineOwner, createProjectBudgetCycle, issueProjectBudgetRound, loadBudgetApprovalReport, loadBudgetOwnerCandidates, loadMyBudgetInbox, loadProjectBudgetApproval, loadProjectBudgetWorkspace, markBudgetNotificationsRead, reviewProjectBudgetRound, saveBudgetVarianceContext, saveProjectBudgetContribution, startNextProjectBudgetRound, submitProjectBudgetDiscipline } from '../../services/budgetService.js';
import { createClientRequestId } from '../write/writeCommand.js';

export function loadDepartmentalBudget(projectId) { return loadProjectBudgetWorkspace(projectId); }
export function commitBudgetCycle(projectId, input) {
  return createProjectBudgetCycle(projectId, { ...input, budgetCycleId: crypto.randomUUID() }, createClientRequestId());
}
export function commitBudgetContribution(cycleId, input) {
  return saveProjectBudgetContribution(cycleId, input, createClientRequestId());
}
export function commitBudgetDisciplineSubmission(cycleId, disciplineId, contributions) {
  return submitProjectBudgetDiscipline(cycleId, disciplineId, contributions, createClientRequestId());
}
export function loadBudgetOwnershipCandidates(projectId){return loadBudgetOwnerCandidates(projectId)}
export function commitBudgetOwnership(cycleId,input){return assignBudgetDisciplineOwner(cycleId,input,createClientRequestId())}
export function loadBudgetInbox(){return loadMyBudgetInbox()}
export function acknowledgeBudgetAssignment(cycleId,disciplineId){return markBudgetNotificationsRead(cycleId,disciplineId)}
export function commitBudgetRound(cycleId,input){return issueProjectBudgetRound(cycleId,{...input,roundId:crypto.randomUUID()},createClientRequestId())}
export function commitNextBudgetRound(cycleId,input){return startNextProjectBudgetRound(cycleId,input,createClientRequestId())}
export function loadBudgetApproval(projectId){return loadProjectBudgetApproval(projectId)}
export function commitBudgetReview(roundId,input){return reviewProjectBudgetRound(roundId,{...input,baselineId:input.decision==='APPROVED'?crypto.randomUUID():null},createClientRequestId())}
export function loadApprovalReport(projectId){return loadBudgetApprovalReport(projectId)}
export function commitBudgetVarianceContext(roundId,input){return saveBudgetVarianceContext(roundId,input,createClientRequestId())}
