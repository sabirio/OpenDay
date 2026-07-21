import { supabase } from '../../lib/supabase.js';

const fromDb = row => ({
  id:String(row.id), projectId:String(row.project_id), snagNumber:row.snag_number, title:row.title, description:row.description,
  categoryCode:row.category_code, disciplineCode:row.discipline_code, priority:row.priority, status:row.status,
  assigneeId:row.assignee_id, dueDate:row.due_date, location:{zoneId:row.location_zone_id,level:row.location_level,room:row.location_room,text:row.location_text,planVersionId:row.plan_version_id,pageNumber:row.plan_page_number,x:row.plan_x,y:row.plan_y,schemaVersion:row.location_schema_version},
  createdBy:row.created_by, createdAt:row.created_at, updatedAt:row.updated_at, closedAt:row.closed_at, cancelledAt:row.cancelled_at,
  version:row.version, schemaVersion:row.schema_version, workflowVersion:row.workflow_version,
  publicationState:row.publication_state||'PUBLISHED', tradeId:row.trade_id||null, stakeholderId:row.stakeholder_id||null,
  publishedAt:row.published_at||null, archivedAt:row.archived_at||null, archiveReason:row.archive_reason||null,
});

function safeError(error) {
  const message=error?.message||'';
  const code=/VERSION_CONFLICT/.test(message)||error?.code==='40001'?'VERSION_CONFLICT':/IDEMPOTENCY_CONFLICT/.test(message)||error?.code==='23505'?'IDEMPOTENCY_CONFLICT':/PROJECT_ACCESS_DENIED/.test(message)?'PROJECT_ACCESS_DENIED':/COMMAND_FORBIDDEN/.test(message)||error?.code==='42501'?'FORBIDDEN':/INVALID_SNAG_TRANSITION|READY_SNAG_REASSIGNMENT/.test(message)?'INVALID_TRANSITION':/SNAG_NOT_FOUND/.test(message)?'NOT_FOUND':/network|fetch|timeout/i.test(message)?'NETWORK_ERROR':'INVALID_PAYLOAD';
  return Object.assign(new Error(code),{code,diagnosticCode:error?.code||code,retryable:code==='NETWORK_ERROR'||code==='VERSION_CONFLICT'});
}

export async function listProjectSnags(projectId,{limit=200}={}) {
  const {data,error}=await supabase.from('snags').select('*').eq('project_id',projectId).order('updated_at',{ascending:false}).limit(limit);
  if(error)throw safeError(error);return (data||[]).map(fromDb);
}
export async function getSnagDetail(projectId,snagId) {
  const [{data:snag,error},{data:events,error:eventError},{data:evidence,error:evidenceError},{data:comments,error:commentError}]=await Promise.all([
    supabase.from('snags').select('*').eq('project_id',projectId).eq('id',snagId).single(),
    supabase.from('snag_events').select('*').eq('project_id',projectId).eq('snag_id',snagId).order('occurred_at',{ascending:true}).order('id',{ascending:true}),
    supabase.from('snag_evidence').select('*').eq('snag_id',snagId).order('created_at',{ascending:true}),
    supabase.from('snag_comments').select('*').eq('project_id',projectId).eq('snag_id',snagId).order('created_at',{ascending:true}).limit(200),
  ]);
  if(error)throw safeError(error);if(eventError)throw safeError(eventError);if(evidenceError)throw safeError(evidenceError);if(commentError)throw safeError(commentError);
  return {snag:fromDb(snag),events:events||[],evidence:evidence||[],comments:comments||[]};
}
export async function listProjectContractors(projectId) {
  const {data,error}=await supabase.rpc('list_snag_project_contractors',{p_project_id:Number(projectId)});
  if(error)throw safeError(error);return data||[];
}
export async function executeCommand(command) {
  const {data,error}=await supabase.rpc('execute_snag_command',{p_command:{type:command.type,projectId:Number(command.projectId),snagId:command.snagId,payload:command.payload||{}},p_client_request_id:command.clientRequestId,p_expected_version:command.expectedVersion??null});
  if(error)throw safeError(error);return {...data,snag:fromDb(data.snag)};
}
export async function captureObservation({projectId,planId,page,x,y,clientRequestId}) {
  const {data,error}=await supabase.rpc('capture_snag_observation',{p_project_id:Number(projectId),p_plan_id:planId,p_page:page,p_x:x,p_y:y,p_client_request_id:clientRequestId});
  if(error)throw safeError(error);return {...data,snag:fromDb(data.snag)};
}
export async function executeProductCommand(command) {
  // Engine-audit fix (2026-07-16): explicit ?? null, matching executeCommand
  // above — behaviorally identical either way (undefined is dropped by
  // JSON.stringify regardless), but the inconsistency was the same shape as
  // this project's real dropped-argument bugs (F-02 and others found in this
  // audit), so kept in sync rather than left to drift on a future refactor.
  const {data,error}=await supabase.rpc('execute_snag_product_command',{p_command:{type:command.type,projectId:Number(command.projectId),snagId:command.snagId,payload:command.payload||{}},p_client_request_id:command.clientRequestId,p_expected_version:command.expectedVersion??null});
  if(error)throw safeError(error);return {...data,snag:fromDb(data.snag)};
}
export async function publishObservations(projectId,snagIds,clientRequestId) {
  const {data,error}=await supabase.rpc('publish_snag_observations',{p_project_id:Number(projectId),p_snag_ids:snagIds,p_client_request_id:clientRequestId});if(error)throw safeError(error);return data;
}
export async function listCaptureCatalog(projectId) {
  const [{data:trades,error},{data:stakeholders,error:stakeholderError},{data:mappings,error:mappingError}]=await Promise.all([
    supabase.from('project_snag_trades').select('*').eq('project_id',projectId).order('name'),
    supabase.from('project_stakeholders').select('*').eq('project_id',projectId).order('company_name'),
    supabase.from('snag_trade_stakeholders').select('*'),
  ]);if(error)throw safeError(error);if(stakeholderError)throw safeError(stakeholderError);if(mappingError)throw safeError(mappingError);
  return {trades:trades||[],stakeholders:stakeholders||[],mappings:mappings||[]};
}
export async function addComment(projectId,snagId,body,clientRequestId){const{data,error}=await supabase.rpc('add_snag_comment',{p_project_id:Number(projectId),p_snag_id:snagId,p_body:body,p_client_request_id:clientRequestId});if(error)throw safeError(error);return data}
export async function configureCatalog(projectId,action,payload){const{data,error}=await supabase.rpc('configure_snag_catalog',{p_project_id:Number(projectId),p_action:action,p_payload:payload});if(error)throw safeError(error);return data}
export {safeError as mapSnagServiceError};
