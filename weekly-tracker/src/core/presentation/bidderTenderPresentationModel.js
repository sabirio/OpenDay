import { appendContractorBidLine, buildBidRoundPresentation, createBidRoundDraft, patchBidRoundDecimal, patchBidRoundItem, setBidLineInclusion, summarizeBidDraft, validateBidRoundDraft } from '../../domains/tender/bidRoundModel.js';
import { createClientRequestId } from '../write/writeCommand.js';
import { presentInvitationOrganizationChoices, presentTenderInboxItems, presentTenderPortalUser } from '../../engines/bidderTenderAccessEngine.js';

export function prepareBidRoundDraft(context){return context?createBidRoundDraft(context):null}
export function presentBidRound(draft,groups){return buildBidRoundPresentation(draft,groups)}
export function inspectBidRound(draft){return draft?validateBidRoundDraft(draft):[]}
export function summarizeBidRound(draft){return draft?summarizeBidDraft(draft):null}
export function changeBidRoundItem(draft,lineId,patch){return patchBidRoundItem(draft,lineId,patch)}
export function changeBidRoundDecimal(draft,lineId,field,value){return patchBidRoundDecimal(draft,lineId,field,value)}
export function addBidRoundLine(draft,workGroupId){return appendContractorBidLine(draft,workGroupId,createClientRequestId())}
export function changeBidLineInclusion(draft,lineId,included){return setBidLineInclusion(draft,lineId,included)}

export function presentTenderWorkspace(data){
  if(!data)return null;
  return{...data,locationLabel:data.projectCity||'Location not specified',deadlineDisplay:new Date(data.deadlineAt).toLocaleString(),setupRevisionLabel:`R${data.setupRevision}`,boqRevisionLabel:`R${data.boqRevision}`,workGroupMap:new Map((data.workGroups||[]).map(group=>[group.id,group]))};
}

export const presentTenderInbox=presentTenderInboxItems;
export const presentTenderPortalAccess=presentTenderPortalUser;
export const presentTenderInvitationOrganizationChoices=presentInvitationOrganizationChoices;
