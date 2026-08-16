import { supabase } from '../lib/supabase';
import { validateWorkOntology } from '../domains/workOntology/workOntologyContract.js';
import { validateExecutionWorkClassifications } from '../domains/workOntology/workOntologyContract.js';

export const WORK_ONTOLOGY_NOT_CONFIGURED = 'Work ontology is not configured.';

export class WorkOntologyConfigurationError extends Error {
  constructor(reason, details = {}) {
    super(WORK_ONTOLOGY_NOT_CONFIGURED);
    this.name = 'WorkOntologyConfigurationError';
    this.code = 'WORK_ONTOLOGY_NOT_CONFIGURED';
    this.reason = reason;
    Object.assign(this, details);
  }
}

function mapVersion(row) {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    schemaVersion: row.schema_version,
    version: row.version,
    label: row.label,
    status: String(row.status || '').toLowerCase(),
  };
}

function selectOwnerVersion(rows, companyId) {
  const companyRows = rows.filter(row => row.company_id === companyId);
  const globalRows = rows.filter(row => row.company_id == null);
  const candidates = companyRows.length > 0 ? companyRows : globalRows;
  if (candidates.length !== 1) {
    throw new WorkOntologyConfigurationError(
      candidates.length === 0 ? 'NO_ACTIVE_VERSION' : 'AMBIGUOUS_ACTIVE_VERSION',
      { candidateCount: candidates.length },
    );
  }
  return candidates[0];
}

async function readRows(table, ontologyVersionId, orderColumn = null) {
  let query = supabase.from(table).select('*').eq('ontology_version_id', ontologyVersionId);
  if (orderColumn) query = query.order(orderColumn, { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadWorkOntologyGraph(versionRow) {
  const [departmentRows, disciplineRows, workGroupRows, boqRows, classificationRows] = await Promise.all([
    readRows('work_ontology_departments', versionRow.id, 'display_order'),
    readRows('work_ontology_disciplines', versionRow.id, 'display_order'),
    readRows('work_ontology_work_groups', versionRow.id, 'display_order'),
    readRows('work_ontology_boq_item_definitions', versionRow.id, 'code'),
    readRows('work_ontology_execution_classifications', versionRow.id, 'execution_work_package_id'),
  ]);

  const ontology = {
    ...mapVersion(versionRow),
    departments: departmentRows.map(row => ({
      id: row.id,
      code: row.code,
      label: row.label,
      displayOrder: row.display_order,
    })),
    disciplines: disciplineRows.map(row => ({
      id: row.id,
      departmentId: row.department_id,
      code: row.code,
      label: row.label,
      displayOrder: row.display_order,
      scopeSelectable: row.scope_selectable,
      budgetSelectable: row.budget_selectable,
    })),
    workGroups: workGroupRows.filter(row => row.is_active !== false).map(row => ({
      id: row.id,
      disciplineId: row.discipline_id,
      code: row.code,
      label: row.label,
      displayOrder: row.display_order,
    })),
    boqItemDefinitions: boqRows.map(row => ({
      id: row.id,
      workGroupId: row.work_group_id,
      code: row.code,
      label: row.label,
      defaultUnit: row.default_unit,
    })),
  };
  const classifications = classificationRows.map(row => ({
    executionWorkPackageId: row.execution_work_package_id,
    kind: String(row.kind || '').toLowerCase(),
    ...(row.work_group_id ? { workGroupId: row.work_group_id } : {}),
    ...(row.reason_code ? { reasonCode: row.reason_code } : {}),
  }));

  const ontologyIssues = validateWorkOntology(ontology);
  const classificationIssues = validateExecutionWorkClassifications(
    classifications,
    ontology,
    classifications.map(item => item.executionWorkPackageId),
  );
  if (ontologyIssues.length > 0 || classificationIssues.length > 0) {
    throw new WorkOntologyConfigurationError('INVALID_ACTIVE_VERSION', {
      issues: [...ontologyIssues, ...classificationIssues],
    });
  }

  return { ...ontology, executionClassifications: classifications };
}

export async function fetchWorkOntologyVersionById(ontologyVersionId) {
  const { data: versions, error } = await supabase
    .from('work_ontology_versions')
    .select('*')
    .eq('id', ontologyVersionId);
  if (error) throw error;
  if ((versions || []).length !== 1) {
    throw new WorkOntologyConfigurationError('PINNED_VERSION_NOT_FOUND', { ontologyVersionId });
  }
  return loadWorkOntologyGraph(versions[0]);
}

export async function resolveActiveWorkOntologyForCurrentCompany(companyId = undefined) {
  let resolvedCompanyId = companyId;
  if (resolvedCompanyId === undefined) {
    const { getCurrentCompanyId } = await import('./templateService.js');
    resolvedCompanyId = await getCurrentCompanyId();
  }

  const { data: versions, error: versionError } = await supabase
    .from('work_ontology_versions')
    .select('*')
    .eq('status', 'PUBLISHED')
    .eq('is_active', true);
  if (versionError) throw versionError;
  const versionRow = selectOwnerVersion(versions || [], resolvedCompanyId ?? null);
  return loadWorkOntologyGraph(versionRow);
}
