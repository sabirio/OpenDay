import { useCallback, useEffect, useMemo, useState } from 'react';
import { addTenderParticipant, changeTenderParticipant, checkTenderInvitationSaved, chooseTenderInvitationPreviewParticipant, commitAwardedExecutionScope, commitTenderAward, commitTenderClarificationDecision, commitTenderSetup, createTenderClarification, deleteTenderParticipant, inspectTenderSetupDraft, issueTenderBidderInvitation, issueTenderClarifications, loadTenderSetupContext, openTenderBidRound, reviewTenderBidSubmission, startTenderSetupDraft } from '../core/tender/tenderSetupOrchestration.js';
import { buildTenderSetupEditorPresentation } from '../core/presentation/tenderPresentationModel.js';

export function useTenderSetup(project){
  const [state,setState]=useState({status:'loading',context:null,draft:null,error:null});const [saving,setSaving]=useState(false);
  const [inviting,setInviting]=useState(null);
  const [openingRound,setOpeningRound]=useState(false);
  const [reviewingSubmission,setReviewingSubmission]=useState(null);
  const [clarificationAction,setClarificationAction]=useState(null);
  const [awarding,setAwarding]=useState(false);
  const [materializingAwardedScope,setMaterializingAwardedScope]=useState(false);
  const load=useCallback(async()=>{if(!project)return;setState(s=>({...s,status:'loading',error:null}));try{const context=await loadTenderSetupContext(project);setState({status:'ready',context,draft:startTenderSetupDraft(project,context),error:null});}catch(error){setState(s=>({...s,status:'error',error}));}},[project]);
  useEffect(()=>{load()},[load]);
  const issues=useMemo(()=>state.draft?inspectTenderSetupDraft(state.draft):[],[state.draft]);
  const invitationSaved=useMemo(()=>state.draft?checkTenderInvitationSaved(state.draft,state.context?.latestSetup):false,[state.context?.latestSetup,state.draft]);
  const presentation=useMemo(()=>state.draft&&state.context?buildTenderSetupEditorPresentation(state.context,state.draft,issues,invitationSaved):null,[invitationSaved,issues,state.context,state.draft]);
  const patch=useCallback(value=>setState(s=>({...s,draft:{...s.draft,...value}})),[]);
  const save=useCallback(async()=>{setSaving(true);try{const result=await commitTenderSetup(project.id,state.draft);await load();return{ok:true,result};}catch(error){return{ok:false,error}}finally{setSaving(false)}},[load,project?.id,state.draft]);
  const invite=useCallback(async participantId=>{if(!state.context?.tender)return{ok:false,error:new Error('SAVE_TENDER_SETUP_FIRST')};setInviting(participantId);try{const result=await issueTenderBidderInvitation(state.context.tender.id,participantId);await load();return{ok:true,result};}catch(error){return{ok:false,error}}finally{setInviting(null)}},[load,state.context?.tender]);
  const openRound=useCallback(async()=>{if(!state.context?.tender)return{ok:false,error:new Error('SAVE_TENDER_SETUP_FIRST')};setOpeningRound(true);try{const result=await openTenderBidRound(state.context.tender.id);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setOpeningRound(false)}},[load,state.context?.tender]);
  const setReviewStatus=useCallback(async(submissionId,status,expectedRevision)=>{setReviewingSubmission(submissionId);try{const result=await reviewTenderBidSubmission(submissionId,status,expectedRevision);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setReviewingSubmission(null)}},[load]);
  const addClarification=useCallback(async(submissionId,subjectType,lineId,workGroupId,type,comment)=>{setClarificationAction(`create-${subjectType}-${lineId||workGroupId||submissionId}`);try{const result=await createTenderClarification(submissionId,subjectType,lineId,workGroupId,type,comment);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setClarificationAction(null)}},[load]);
  const issueClarifications=useCallback(async submissionId=>{setClarificationAction(`issue-${submissionId}`);try{const result=await issueTenderClarifications(submissionId);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setClarificationAction(null)}},[load]);
  const decideClarification=useCallback(async(id,decision,note,revision)=>{setClarificationAction(`decision-${id}`);try{const result=await commitTenderClarificationDecision(id,decision,note,revision);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setClarificationAction(null)}},[load]);
  const award=useCallback(async(submissionId,note)=>{setAwarding(true);try{const result=await commitTenderAward(submissionId,note);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setAwarding(false)}},[load]);
  const materializeAwardedScope=useCallback(async(awardId,expectedLatestScopeRevision)=>{setMaterializingAwardedScope(true);try{const result=await commitAwardedExecutionScope(awardId,expectedLatestScopeRevision);await load();return{ok:true,result}}catch(error){return{ok:false,error}}finally{setMaterializingAwardedScope(false)}},[load]);
  const addParticipant=useCallback(()=>setState(s=>({...s,draft:addTenderParticipant(s.draft)})),[]);
  const updateParticipant=useCallback((id,field,value)=>setState(s=>({...s,draft:changeTenderParticipant(s.draft,id,field,value)})),[]);
  const removeParticipant=useCallback(id=>setState(s=>({...s,draft:deleteTenderParticipant(s.draft,id)})),[]);
  const previewParticipant=useCallback(()=>chooseTenderInvitationPreviewParticipant(state.draft),[state.draft]);
  return {...state,saving,inviting,openingRound,reviewingSubmission,clarificationAction,awarding,materializingAwardedScope,issues,invitationSaved,presentation,patch,addParticipant,updateParticipant,removeParticipant,previewParticipant,save,invite,openRound,setReviewStatus,addClarification,issueClarifications,decideClarification,award,materializeAwardedScope,retry:load};
}
