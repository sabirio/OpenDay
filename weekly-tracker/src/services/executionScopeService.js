import { supabase } from '../lib/supabase';
import { validateExecutionScope } from '../domains/workOntology/executionScopeModel.js';
import { fetchWorkOntologyVersionById } from './workOntologyService.js';

export class ExecutionScopeConfigurationError extends Error {
  constructor(reason, details = {}) {
    super('Project execution scope is not configured correctly.');
    this.name = 'ExecutionScopeConfigurationError';
    this.code = 'EXECUTION_SCOPE_NOT_CONFIGURED';
    this.reason = reason;
    Object.assign(this, details);
  }
}

export async function fetchCurrentProjectExecutionScope(projectId) {
  const { data: versions, error: versionError } = await supabase
    .from('project_execution_scope_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('revision_number', { ascending: false })
    .limit(1);
  if (versionError) throw versionError;
  const version = versions?.[0];
  if (!version) return null;

  const [{ data: itemRows, error: itemError }, ontology] = await Promise.all([
    supabase
      .from('project_execution_scope_items')
      .select('execution_scope_version_id, ontology_version_id, discipline_id, work_group_id')
      .eq('execution_scope_version_id', version.id),
    fetchWorkOntologyVersionById(version.ontology_version_id),
  ]);
  if (itemError) throw itemError;

  const rows = itemRows || [];
  const rowsByWorkGroupId = new Map(rows.map(row => [row.work_group_id, row]));
  const workGroups = ontology.workGroups.filter(item => rowsByWorkGroupId.has(item.id));
  const selectedDisciplineIds = version.selected_discipline_ids || [];
  const scope = {
    id: version.id,
    projectId: version.project_id,
    schemaVersion: version.schema_version,
    revisionNumber: version.revision_number,
    sourceKind: version.source_kind,
    sourceBoqVersionId: version.source_boq_version_id ?? null,
    sourceAwardId: version.source_award_id ?? null,
    ontologyVersionId: version.ontology_version_id,
    selectedDisciplineIds,
    workGroupIds: workGroups.map(item => item.id),
    disciplines: ontology.disciplines.filter(item => selectedDisciplineIds.includes(item.id)),
    workGroups,
    createdBy: version.created_by ?? null,
    createdAt: version.created_at,
  };

  const rowIssues = rows.length !== rowsByWorkGroupId.size
    || rows.some(row => {
      const workGroup = ontology.workGroups.find(item => item.id === row.work_group_id);
      return row.ontology_version_id !== version.ontology_version_id
        || !workGroup
        || workGroup.disciplineId !== row.discipline_id;
    });
  const issues = validateExecutionScope(scope, ontology);
  if (rowIssues || issues.length > 0) {
    throw new ExecutionScopeConfigurationError('INVALID_PERSISTED_SCOPE', { issues });
  }
  return scope;
}

export async function materializeExecutionScopeFromBoq(projectId, boqVersionId, expectedLatestScopeRevision, clientRequestId) {
  const { data, error } = await supabase.rpc('materialize_project_execution_scope_from_boq', {
    p_project_id: projectId,
    p_boq_version_id: boqVersionId,
    p_expected_latest_scope_revision: expectedLatestScopeRevision,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data;
}
