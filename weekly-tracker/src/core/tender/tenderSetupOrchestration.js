import { loadProjectBoqs, loadProjectBoqVersions, loadProjectBoqWorkGroupTotals } from '../../services/projectBoqService.js';
import { loadProjectTenderSetups, saveProjectTenderSetup } from '../../services/tenderService.js';
import { appendTenderParticipant, buildTenderSetupPayload, createTenderSetupDraft, isTenderInvitationSaved, pickTenderInvitationPreviewParticipant, prepareTenderSetupContext, removeTenderParticipant, updateTenderParticipant, validateTenderSetupDraft } from '../../engines/tenderSetupEngine.js';
import { loadCommercialFoundation } from '../../services/commercialFoundationService.js';
import { loadConsultantBoqWorkspace } from '../../services/consultantBoqService.js';
import { createClientRequestId } from '../write/writeCommand.js';
import {loadTenderBidderAccess,sendTenderBidderInvitation} from '../../services/tenderBidderService.js';
import {loadTenderBidReviewWorkspace,loadTenderBidRounds,openNextTenderBidRound,setTenderBidReviewStatus} from '../../services/tenderBidRoundService.js';
import{closeTenderClarification,createTenderClarification as createTenderClarificationRecord,issueTenderClarificationSet,loadTenderClarificationWorkspace,resolveTenderClarification}from'../../services/tenderClarificationService.js';
import{loadTenderComparisonWorkspace}from'../../services/tenderComparisonService.js';
import{awardProjectTender,loadTenderAwardWorkspace,materializeAwardedExecutionScope}from'../../services/tenderAwardService.js';

export async function loadTenderSetupContext(project){
  if(!project?.workOntologyVersionId){const e=new Error('TENDER_REQUIRES_WORK_ONTOLOGY');e.code='TENDER_REQUIRES_WORK_ONTOLOGY';throw e;}
  const [tenders,commercial]=await Promise.all([loadProjectTenderSetups(project.id),loadCommercialFoundation(project.id)]);const tender=tenders[0]||null;
  let boq=null,boqVersions=[],selectedBoqVersion=null,totals=[],consultantWorkspace=null;
  if(tender?.boqMode==='CONSULTANT_MEASURED'){
    consultantWorkspace=await loadConsultantBoqWorkspace(tender.id);
    if(consultantWorkspace.issuedProjectBoqVersionId){boq={id:consultantWorkspace.projectBoqId,currencyCode:consultantWorkspace.currencyCode};boqVersions=await loadProjectBoqVersions(boq.id);selectedBoqVersion=boqVersions.find(item=>item.id===consultantWorkspace.issuedProjectBoqVersionId)||null;}
  }else if(tender){const boqs=await loadProjectBoqs(project.id);boq=boqs[0]||null;boqVersions=boq?await loadProjectBoqVersions(boq.id):[];selectedBoqVersion=boqVersions.at(-1)||null;totals=selectedBoqVersion?await loadProjectBoqWorkGroupTotals(selectedBoqVersion.id):[];}
  const [bidderAccess,bidRounds,bidReviewWorkspace,clarificationWorkspace,comparisonWorkspace,awardWorkspace]=tender?await Promise.all([loadTenderBidderAccess(tender.id),loadTenderBidRounds(tender.id),loadTenderBidReviewWorkspace(tender.id),loadTenderClarificationWorkspace(tender.id),loadTenderComparisonWorkspace(tender.id),loadTenderAwardWorkspace(tender.id)]):[[],[],null,null,null,null];
  return prepareTenderSetupContext({project,tenders,tender,commercial,boq,boqVersions,selectedBoqVersion,totals,consultantWorkspace,bidderAccess,bidRounds,bidReviewWorkspace,clarificationWorkspace,comparisonWorkspace,awardWorkspace});
}
export function startTenderSetupDraft(project,context){return createTenderSetupDraft(project,context)}
export function inspectTenderSetupDraft(draft){return validateTenderSetupDraft(draft)}
export function checkTenderInvitationSaved(draft,latestSetup){return isTenderInvitationSaved(draft,latestSetup)}
export function addTenderParticipant(draft){return appendTenderParticipant(draft,createClientRequestId())}
export function changeTenderParticipant(draft,participantId,field,value){return updateTenderParticipant(draft,participantId,field,value)}
export function deleteTenderParticipant(draft,participantId){return removeTenderParticipant(draft,participantId)}
export function chooseTenderInvitationPreviewParticipant(draft){return pickTenderInvitationPreviewParticipant(draft)}
export function commitTenderSetup(projectId,draft){return saveProjectTenderSetup(projectId,buildTenderSetupPayload(draft),createClientRequestId());}
export function issueTenderBidderInvitation(tenderId,participantId){return sendTenderBidderInvitation(tenderId,participantId,createClientRequestId());}
export function openTenderBidRound(tenderId){return openNextTenderBidRound(tenderId,createClientRequestId())}
export function reviewTenderBidSubmission(submissionId,status,expectedRevision){return setTenderBidReviewStatus(submissionId,status,expectedRevision,createClientRequestId())}
export function createTenderClarification(submissionId,subjectType,lineId,workGroupId,type,comment){return createTenderClarificationRecord(submissionId,subjectType,lineId,workGroupId,type,comment,createClientRequestId())}
export function issueTenderClarifications(submissionId){return issueTenderClarificationSet(submissionId,createClientRequestId())}
export function decideTenderClarification(clarificationId,decision,note,revision){return resolveTenderClarification(clarificationId,decision,note,revision,createClientRequestId())}
export function closeAcceptedTenderClarification(clarificationId,note,revision){return closeTenderClarification(clarificationId,note,revision,createClientRequestId())}
export function commitTenderClarificationDecision(clarificationId,decision,note,revision){return decision==='CLOSED'?closeAcceptedTenderClarification(clarificationId,note,revision):decideTenderClarification(clarificationId,decision,note,revision)}
export function commitTenderAward(submissionId,note){return awardProjectTender(submissionId,note,createClientRequestId())}
export function commitAwardedExecutionScope(awardId,expectedLatestScopeRevision){return materializeAwardedExecutionScope(awardId,expectedLatestScopeRevision,createClientRequestId())}
