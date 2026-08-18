import { supabase } from '../lib/supabase';

function mapBoq(row) {
  return { id: row.id, projectId: row.project_id, ontologyVersionId: row.ontology_version_id, title: row.title, currencyCode: row.currency_code, createdBy: row.created_by, createdAt: row.created_at };
}
function mapVersion(row) {
  return { id: row.id, boqId: row.boq_id, projectId: row.project_id, ontologyVersionId: row.ontology_version_id, revisionNumber: row.revision_number, sourceKind: row.source_kind, revisionNote: row.revision_note, createdBy: row.created_by, createdAt: row.created_at };
}
function mapItem(row) {
  return {
    versionId: row.boq_version_id, lineId: row.line_id, workGroupId: row.work_group_id,
    itemKind: row.item_kind, standardDefinitionId: row.standard_definition_id,
    description: row.description, unit: row.unit, quantity: row.quantity, consultantQuantity: row.consultant_quantity,
    labourRate: row.labour_rate, materialRate: row.material_rate,
    unitRate: row.unit_rate, lineTotal: row.line_total, contractorNote: row.contractor_note,
    reference: row.reference, specification: row.specification, sortOrder: row.sort_order,
  };
}
function mapWorkGroupTotal(row) {
  return {
    versionId: row.boq_version_id, boqId: row.boq_id, projectId: row.project_id,
    ontologyVersionId: row.ontology_version_id, currencyCode: row.currency_code,
    revisionNumber: row.revision_number, disciplineId: row.discipline_id,
    disciplineCode: row.discipline_code, disciplineLabel: row.discipline_label,
    disciplineDisplayOrder: row.discipline_display_order, workGroupId: row.work_group_id,
    workGroupCode: row.work_group_code, workGroupLabel: row.work_group_label,
    workGroupDisplayOrder: row.work_group_display_order, lineCount: row.line_count,
    standardLineCount: row.standard_line_count, customLineCount: row.custom_line_count,
    pricedLineCount: row.priced_line_count, unpricedLineCount: row.unpriced_line_count,
    pricedTotal: row.priced_total, isFullyPriced: row.is_fully_priced,
  };
}
function mapItemIdentity(row) {
  return {
    boqId: row.boq_id, lineId: row.line_id, projectId: row.project_id,
    ontologyVersionId: row.ontology_version_id, workGroupId: row.work_group_id,
    itemKind: row.item_kind, standardDefinitionId: row.standard_definition_id,
    firstSeenVersionId: row.first_seen_version_id, createdAt: row.created_at,
  };
}

export async function loadProjectBoqs(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase.from('project_boqs').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapBoq);
}

export async function loadProjectBoqVersions(boqId) {
  if (!boqId) return [];
  const { data, error } = await supabase.from('project_boq_versions').select('*').eq('boq_id', boqId).order('revision_number', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapVersion);
}

export async function loadProjectBoqVersionItems(versionId) {
  if (!versionId) return [];
  const { data, error } = await supabase.from('project_boq_items').select('*').eq('boq_version_id', versionId).order('sort_order', { ascending: true }).order('line_id', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapItem);
}

export async function loadProjectBoqWorkGroupTotals(versionId) {
  if (!versionId) return [];
  const { data, error } = await supabase.from('project_boq_work_group_totals')
    .select('*').eq('boq_version_id', versionId)
    .order('discipline_display_order', { ascending: true })
    .order('work_group_display_order', { ascending: true })
    .order('work_group_id', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapWorkGroupTotal);
}

export async function loadProjectBoqItemIdentities(boqId) {
  if (!boqId) return [];
  const { data, error } = await supabase.from('project_boq_item_identities')
    .select('*').eq('boq_id', boqId).order('created_at', { ascending: true }).order('line_id', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapItemIdentity);
}

export async function saveProjectBoqRevision(projectId, payload, clientRequestId, sourceKind = 'NATIVE') {
  if (!['NATIVE', 'IMPORT'].includes(sourceKind)) {
    const error = new Error('INVALID_BOQ_REVISION_SOURCE');
    error.code = 'INVALID_BOQ_REVISION_SOURCE';
    throw error;
  }
  const rpcName = sourceKind === 'IMPORT' ? 'import_project_boq_revision' : 'save_project_boq_revision';
  const { data, error } = await supabase.rpc(rpcName, {
    p_project_id: projectId,
    p_boq_id: payload.boqId,
    p_title: payload.title,
    p_currency_code: payload.currencyCode,
    p_items: payload.items,
    p_expected_latest_revision: payload.expectedLatestRevision,
    p_revision_note: payload.revisionNote,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}
