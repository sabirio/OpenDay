import { supabase } from '../lib/supabase';

const mapTender = row => ({ id:row.id, projectId:row.project_id, ontologyVersionId:row.ontology_version_id, procuringOrganizationId:row.procuring_organization_id, tenderNumber:row.tender_number, status:row.status, procurementMethod:row.procurement_method, boqMode:row.boq_mode, commercialRevision:row.commercial_revision, createdAt:row.created_at });
const mapSetup = row => ({ id:row.id, tenderId:row.tender_id, revisionNumber:row.revision_number, title:row.title, deadlineAt:row.deadline_at, currencyCode:row.currency_code, tenderRules:row.tender_rules, invitationMessage:row.invitation_message, issuedBoqId:row.issued_boq_id, issuedBoqVersionId:row.issued_boq_version_id, createdAt:row.created_at });

export async function loadProjectTenderSetups(projectId) {
  const {data:tenders,error:tenderError}=await supabase.from('project_tenders').select('*').eq('project_id',projectId).order('created_at');
  if(tenderError)throw tenderError;
  if(!tenders?.length)return [];
  const ids=tenders.map(item=>item.id);
  const [{data:versions,error:versionError},{data:scope,error:scopeError},{data:participants,error:participantError},{data:organizationParticipants,error:organizationParticipantError}]=await Promise.all([
    supabase.from('project_tender_setup_versions').select('*').in('tender_id',ids).order('revision_number'),
    supabase.from('project_tender_scope_work_groups').select('*').in('tender_id',ids),
    supabase.from('project_tender_participants').select('*').in('tender_id',ids),
    supabase.from('project_tender_organization_participants').select('*').in('tender_id',ids),
  ]);
  if(versionError)throw versionError;if(scopeError)throw scopeError;if(participantError)throw participantError;if(organizationParticipantError)throw organizationParticipantError;
  return tenders.map(row=>{const tender=mapTender(row);const own=(versions||[]).filter(v=>v.tender_id===row.id).map(mapSetup);const latest=own.at(-1)||null;return {...tender,versions:own,latestSetup:latest,scopeWorkGroupIds:(scope||[]).filter(x=>x.tender_setup_version_id===latest?.id).map(x=>x.work_group_id),participants:(participants||[]).filter(x=>x.tender_setup_version_id===latest?.id).map(x=>{const identity=(organizationParticipants||[]).find(p=>p.tender_setup_version_id===x.tender_setup_version_id&&p.participant_id===x.participant_id);return{participantId:x.participant_id,biddingOrganizationId:identity?.bidding_organization_id||null,biddingOrganizationName:identity?.bidding_organization_name||x.contractor_name,contractorName:x.contractor_name,contactEmail:x.contact_email}})};});
}

export async function saveProjectTenderSetup(projectId,payload,clientRequestId){
  const {data,error}=await supabase.rpc('save_project_tender_setup',{p_project_id:projectId,p_tender_id:payload.tenderId,p_tender_number:payload.tenderNumber,p_title:payload.title,p_deadline_at:payload.deadlineAt,p_currency_code:payload.currencyCode,p_tender_rules:payload.tenderRules,p_invitation_message:payload.invitationMessage,p_issued_boq_version_id:payload.issuedBoqVersionId,p_work_group_ids:payload.workGroupIds,p_participants:payload.participants,p_expected_latest_revision:payload.expectedLatestRevision,p_client_request_id:clientRequestId});
  if(error)throw error;return data;
}
