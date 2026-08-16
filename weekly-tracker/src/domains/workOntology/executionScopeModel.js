import { buildWorkOntologyIndex, validateWorkOntology } from './workOntologyContract.js';

export const EXECUTION_SCOPE_SCHEMA_VERSION = 1;
export const PM_DISCIPLINE_SCOPE_SOURCE = 'PM_DISCIPLINE_SCOPE';
export const BOQ_REVISION_SCOPE_SOURCE = 'BOQ_REVISION';
export const AWARDED_BOQ_SCOPE_SOURCE = 'AWARDED_BOQ';

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

/**
 * Resolves high-level PM Discipline scope to a deterministic Work Group set.
 * This is an execution-scope input, not a construction plan: it deliberately
 * contains no activities, dates, durations, dependencies, zones, or progress.
 */
export function deriveExecutionScopeFromDisciplines(disciplineIds, ontology) {
  const index = buildWorkOntologyIndex(ontology);
  if (!Array.isArray(disciplineIds) || disciplineIds.length === 0) {
    fail('INVALID_EXECUTION_SCOPE_DISCIPLINES');
  }

  const selected = new Set();
  for (const disciplineId of disciplineIds) {
    if (selected.has(disciplineId)) {
      fail('DUPLICATE_EXECUTION_SCOPE_DISCIPLINE', { referenceId: disciplineId ?? null });
    }
    const discipline = index.disciplinesById.get(disciplineId);
    if (!discipline || discipline.scopeSelectable === false) {
      fail('UNKNOWN_EXECUTION_SCOPE_DISCIPLINE', { referenceId: disciplineId ?? null });
    }
    selected.add(disciplineId);
  }

  const disciplines = ontology.disciplines.filter(item => selected.has(item.id));
  const workGroups = ontology.workGroups.filter(item => selected.has(item.disciplineId));
  if (workGroups.length === 0) fail('EMPTY_EXECUTION_SCOPE');

  return {
    schemaVersion: EXECUTION_SCOPE_SCHEMA_VERSION,
    sourceKind: PM_DISCIPLINE_SCOPE_SOURCE,
    ontologyVersionId: ontology.id,
    selectedDisciplineIds: disciplines.map(item => item.id),
    workGroupIds: workGroups.map(item => item.id),
    disciplines,
    workGroups,
  };
}

/** Collapse detailed STANDARD and CUSTOM BOQ rows to canonical Work Groups. */
export function deriveExecutionScopeFromBoqItems(boqItems, ontology, sourceBoqVersionId = null) {
  const index = buildWorkOntologyIndex(ontology);
  if (!Array.isArray(boqItems) || boqItems.length === 0) fail('EMPTY_BOQ_EXECUTION_SCOPE');
  const selectedWorkGroupIds = new Set();
  for (const item of boqItems) {
    const workGroupId = item?.workGroupId;
    if (!index.workGroupsById.has(workGroupId)) {
      fail('UNKNOWN_BOQ_WORK_GROUP', { referenceId: workGroupId ?? null });
    }
    selectedWorkGroupIds.add(workGroupId);
  }
  const workGroups = ontology.workGroups.filter(group => selectedWorkGroupIds.has(group.id));
  const selectedDisciplineIds = ontology.disciplines
    .filter(discipline => workGroups.some(group => group.disciplineId === discipline.id))
    .map(discipline => discipline.id);
  return {
    schemaVersion: EXECUTION_SCOPE_SCHEMA_VERSION,
    sourceKind: BOQ_REVISION_SCOPE_SOURCE,
    sourceBoqVersionId,
    ontologyVersionId: ontology.id,
    selectedDisciplineIds,
    workGroupIds: workGroups.map(group => group.id),
    disciplines: ontology.disciplines.filter(item => selectedDisciplineIds.includes(item.id)),
    workGroups,
    boqLineCount: boqItems.length,
    collapsedLineCount: boqItems.length - workGroups.length,
  };
}

/** Validate a persisted Execution Scope snapshot against its pinned ontology. */
export function validateExecutionScope(scope, ontology) {
  const ontologyIssues = validateWorkOntology(ontology);
  if (ontologyIssues.length > 0) return [{ code: 'INVALID_WORK_ONTOLOGY', issues: ontologyIssues }];
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    return [{ code: 'INVALID_EXECUTION_SCOPE_SHAPE' }];
  }

  const issues = [];
  if (scope.schemaVersion !== EXECUTION_SCOPE_SCHEMA_VERSION) {
    issues.push({ code: 'UNSUPPORTED_EXECUTION_SCOPE_SCHEMA_VERSION', value: scope.schemaVersion ?? null });
  }
  if (![PM_DISCIPLINE_SCOPE_SOURCE, BOQ_REVISION_SCOPE_SOURCE, AWARDED_BOQ_SCOPE_SOURCE].includes(scope.sourceKind)) {
    issues.push({ code: 'UNSUPPORTED_EXECUTION_SCOPE_SOURCE', value: scope.sourceKind ?? null });
  }
  if (scope.ontologyVersionId !== ontology.id) {
    issues.push({ code: 'EXECUTION_SCOPE_ONTOLOGY_MISMATCH', value: scope.ontologyVersionId ?? null });
  }

  if ([BOQ_REVISION_SCOPE_SOURCE, AWARDED_BOQ_SCOPE_SOURCE].includes(scope.sourceKind)) {
    if (scope.sourceKind === BOQ_REVISION_SCOPE_SOURCE && (!Number.isInteger(scope.sourceBoqVersionId) || scope.sourceBoqVersionId <= 0)) {
      issues.push({ code: 'INVALID_SOURCE_BOQ_VERSION_ID' });
    }
    if (scope.sourceKind === AWARDED_BOQ_SCOPE_SOURCE && (typeof scope.sourceAwardId !== 'string' || scope.sourceAwardId.length === 0)) {
      issues.push({ code: 'INVALID_SOURCE_AWARD_ID' });
    }
    const workGroupIds = Array.isArray(scope.workGroupIds) ? scope.workGroupIds : null;
    if (!workGroupIds || workGroupIds.length === 0) return [...issues, { code: 'INVALID_EXECUTION_SCOPE_WORK_GROUPS' }];
    if (workGroupIds.length !== new Set(workGroupIds).size) issues.push({ code: 'DUPLICATE_EXECUTION_SCOPE_WORK_GROUP' });
    if (workGroupIds.some(id => !ontology.workGroups.some(group => group.id === id))) issues.push({ code: 'UNKNOWN_EXECUTION_SCOPE_WORK_GROUP' });
    const expectedWorkGroups = ontology.workGroups.filter(group => new Set(workGroupIds).has(group.id));
    if (expectedWorkGroups.map(group => group.id).some((id, index) => id !== workGroupIds[index])) issues.push({ code: 'EXECUTION_SCOPE_WORK_GROUP_ORDER_MISMATCH' });
    const expectedDisciplineIds = ontology.disciplines.filter(discipline => expectedWorkGroups.some(group => group.disciplineId === discipline.id)).map(discipline => discipline.id);
    if (!Array.isArray(scope.selectedDisciplineIds) || expectedDisciplineIds.join(',') !== scope.selectedDisciplineIds.join(',')) issues.push({ code: 'EXECUTION_SCOPE_DISCIPLINE_SET_MISMATCH' });
    return issues;
  }

  let expected;
  try {
    expected = deriveExecutionScopeFromDisciplines(scope.selectedDisciplineIds, ontology);
  } catch (error) {
    issues.push({ code: error.code || 'INVALID_EXECUTION_SCOPE_DISCIPLINES', referenceId: error.referenceId ?? null });
    return issues;
  }

  const workGroupIds = Array.isArray(scope.workGroupIds) ? scope.workGroupIds : null;
  if (!workGroupIds) {
    issues.push({ code: 'INVALID_EXECUTION_SCOPE_WORK_GROUPS' });
    return issues;
  }
  if (workGroupIds.length !== new Set(workGroupIds).size) {
    issues.push({ code: 'DUPLICATE_EXECUTION_SCOPE_WORK_GROUP' });
  }
  if (workGroupIds.length !== expected.workGroupIds.length
    || workGroupIds.some((id, index) => id !== expected.workGroupIds[index])) {
    issues.push({ code: 'EXECUTION_SCOPE_WORK_GROUP_SET_MISMATCH' });
  }
  return issues;
}
