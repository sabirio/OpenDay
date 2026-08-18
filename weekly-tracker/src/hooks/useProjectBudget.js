import { useCallback, useEffect, useState } from 'react';
import { commitBudgetContribution, commitBudgetCycle, commitBudgetDisciplineSubmission, commitBudgetReview, commitBudgetRound, commitBudgetVarianceContext, commitNextBudgetRound, loadApprovalReport, loadBudgetApproval, loadDepartmentalBudget } from '../core/budget/budgetOrchestration.js';
import { planProjectBudgetWorkbookImport } from '../core/budget/budgetSpreadsheetOrchestration.js';

export function useProjectBudget(project) {
  const projectId = project?.id;
  const [state, setState] = useState({ status: 'loading', workspace: null, error: null });
  const [busy, setBusy] = useState(null);
  const [importState, setImportState] = useState({ status: 'idle', file: null, plan: null });
  const load = useCallback(async () => {
    if (!projectId) return;
    setState(current => ({ ...current, status: 'loading' }));
    try { const workspace=await loadDepartmentalBudget(projectId);const[approval,report]=await Promise.all([loadBudgetApproval(projectId),workspace.canManageOwnership&&workspace.roundControl?.state==='ISSUED'?loadApprovalReport(projectId):null]);setState({ status: 'ready', workspace:{...workspace,approval,approvalReport:report}, error: null });setImportState({ status: 'idle', file: null, plan: null }); }
    catch (error) { setState({ status: 'error', workspace: null, error }); }
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    loadDepartmentalBudget(projectId)
      .then(async workspace=>{const[approval,report]=await Promise.all([loadBudgetApproval(projectId),workspace.canManageOwnership&&workspace.roundControl?.state==='ISSUED'?loadApprovalReport(projectId):null]);return{workspace:{...workspace,approval,approvalReport:report}}})
      .then(result => { if (alive) setState({ status: 'ready', ...result, error: null }); })
      .catch(error => { if (alive) setState({ status: 'error', workspace: null, error }); });
    return () => { alive = false; };
  }, [projectId]);
  const createCycle = async input => {
    setBusy('cycle');
    try { const result = await commitBudgetCycle(projectId, input); await load(); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  };
  const saveContributions = async (disciplineId, inputs) => {
    setBusy(`discipline-${disciplineId}`);
    try { const result = await Promise.all(inputs.map(input => commitBudgetContribution(state.workspace.cycle.budgetCycleId, input))); await load(); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  };
  const submitContributions = async (disciplineId, inputs) => {
    setBusy(`discipline-${disciplineId}`);
    try { const result = await commitBudgetDisciplineSubmission(state.workspace.cycle.budgetCycleId, disciplineId, inputs); await load(); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  };
  const issueRound=async()=>{setBusy('issue-round');try{const result=await commitBudgetRound(state.workspace.cycle.budgetCycleId,{revision:state.workspace.roundControl.revision});await load();return{ok:true,result}}catch(error){await load();return{ok:false,error}}finally{setBusy(null)}};
  const startNextRound=async note=>{setBusy('next-round');try{const result=await commitNextBudgetRound(state.workspace.cycle.budgetCycleId,{note,revision:state.workspace.roundControl.revision});await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setBusy(null)}};
  const reviewRound=async input=>{setBusy('review-round');try{const result=await commitBudgetReview(state.workspace.rounds[0].roundId,{...input,revision:state.workspace.approval.approvalRevision});await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setBusy(null)}};
  const returnForNextRound=async comment=>{setBusy('return-next-round');let reviewCommitted=false;try{await commitBudgetReview(state.workspace.rounds[0].roundId,{decision:'REVISION_REQUIRED',comment,revision:state.workspace.approval.approvalRevision});reviewCommitted=true;const result=await commitNextBudgetRound(state.workspace.cycle.budgetCycleId,{note:comment,revision:state.workspace.roundControl.revision});await load();return{ok:true,result}}catch(error){if(reviewCommitted)await load();return{ok:false,error}}finally{setBusy(null)}};
  const saveVarianceContext=async input=>{setBusy(`variance-${input.workGroupId}`);try{const result=await commitBudgetVarianceContext(state.workspace.approvalReport.roundId,input);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setBusy(null)}};
  const previewImport=async file=>{const data=await file.arrayBuffer();const exchangeFile={filename:file.name,data};const plan=planProjectBudgetWorkbookImport(exchangeFile,{projectId,workspace:state.workspace});setImportState({status:plan.ok?'ready':'invalid',file:exchangeFile,plan});return plan};
  const commitImport=async()=>{setBusy('budget-import');setImportState(current=>({...current,status:'committing'}));try{const plan=planProjectBudgetWorkbookImport(importState.file,{projectId,workspace:state.workspace});if(!plan.ok){const error=new Error('INVALID_PROJECT_BUDGET_WORKBOOK');error.code='INVALID_PROJECT_BUDGET_WORKBOOK';error.issues=plan.issues;throw error}for(let index=0;index<plan.changes.length;index+=20)await Promise.all(plan.changes.slice(index,index+20).map(input=>commitBudgetContribution(state.workspace.cycle.budgetCycleId,input)));await load();return{ok:true,summary:plan.summary}}catch(error){setImportState(current=>({...current,status:'invalid',plan:{ok:false,issues:error.issues||[{code:error.code||'BUDGET_IMPORT_FAILED'}]}}));return{ok:false,error}}finally{setBusy(null)}};
  return { ...state, busy, importState, createCycle, saveContributions, submitContributions, issueRound, startNextRound, reviewRound, returnForNextRound, saveVarianceContext, previewImport, commitImport, dismissImport:()=>setImportState({status:'idle',file:null,plan:null}), retry: load };
}
