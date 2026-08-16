import {loadMyTenderCommercialIdentity,loadMyTenderInbox,loadMyTenderWorkspace,respondToMyTenderInvitation} from '../../services/tenderBidderService.js';
import {loadMyBidRoundWorkspace,saveMyBidDraft,submitMyBid}from'../../services/tenderBidRoundService.js';
import{buildBidDraftPayload}from'../../domains/tender/bidRoundModel.js';
import{createClientRequestId}from'../write/writeCommand.js';
import{loadMyTenderClarifications,respondToTenderClarification}from'../../services/tenderClarificationService.js';
export function loadBidderTenderInbox(){return loadMyTenderInbox()}
export function commitTenderInvitationResponse(tenderId,decision){return respondToMyTenderInvitation(tenderId,decision,createClientRequestId())}
export async function loadBidderTenderWorkspace(tenderId){const[workspace,identity]=await Promise.all([loadMyTenderWorkspace(tenderId),loadMyTenderCommercialIdentity(tenderId)]);return{...workspace,...identity}}
export async function loadBidderRoundWorkspace(tenderId){const[workspace,identity]=await Promise.all([loadMyBidRoundWorkspace(tenderId),loadMyTenderCommercialIdentity(tenderId)]);return workspace?{...workspace,...identity}:null}
export function commitBidderDraft(draft){const payload=buildBidDraftPayload(draft);return saveMyBidDraft(draft.bidRoundId,payload,createClientRequestId())}
export function commitBidderSubmission(draft){return submitMyBid(draft.bidRoundId,draft.draftRevision,createClientRequestId())}
export function loadBidderClarifications(tenderId){return loadMyTenderClarifications(tenderId)}
export function commitBidderClarificationResponse(clarificationId,response,revision){return respondToTenderClarification(clarificationId,response,revision,createClientRequestId())}
