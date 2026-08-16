const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*(?:\.[A-Z0-9][A-Z0-9_]*)*$/;

export const WORK_ONTOLOGY_SCHEMA_VERSION = 2;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateIdentity(entity, entityType, issues) {
  if (!UUID_PATTERN.test(entity?.id ?? '')) {
    issues.push({ code: 'INVALID_TECHNICAL_ID', entityType, entityId: entity?.id ?? null });
  }
  if (!CODE_PATTERN.test(entity?.code ?? '')) {
    issues.push({ code: 'INVALID_READABLE_CODE', entityType, entityId: entity?.id ?? null });
  }
  if (!isNonEmptyString(entity?.label)) {
    issues.push({ code: 'MISSING_LABEL', entityType, entityId: entity?.id ?? null });
  }
}

function validateUnique(records, field, entityType, issueCode, issues) {
  const seen = new Set();
  for (const record of records) {
    const value = record?.[field];
    if (seen.has(value)) {
      issues.push({ code: issueCode, entityType, field, value: value ?? null });
    }
    seen.add(value);
  }
}

/**
 * Validates the provider-neutral Master Work Library contract.
 *
 * This contract deliberately does not contain project scope, schedule
 * activities, costs, or progress. Those facts reference Work Group ids but
 * retain their own lifecycle and ownership.
 */
export function validateWorkOntology(ontology) {
  const issues = [];
  if (!ontology || typeof ontology !== 'object' || Array.isArray(ontology)) {
    return [{ code: 'INVALID_ONTOLOGY_SHAPE' }];
  }
  if (ontology.schemaVersion !== WORK_ONTOLOGY_SCHEMA_VERSION) {
    issues.push({ code: 'UNSUPPORTED_SCHEMA_VERSION', value: ontology.schemaVersion ?? null });
  }
  if (!UUID_PATTERN.test(ontology.id ?? '')) {
    issues.push({ code: 'INVALID_ONTOLOGY_ID', value: ontology.id ?? null });
  }
  if (!Number.isInteger(ontology.version) || ontology.version < 1) {
    issues.push({ code: 'INVALID_ONTOLOGY_VERSION', value: ontology.version ?? null });
  }

  const departments = Array.isArray(ontology.departments) ? ontology.departments : [];
  const disciplines = Array.isArray(ontology.disciplines) ? ontology.disciplines : [];
  const workGroups = Array.isArray(ontology.workGroups) ? ontology.workGroups : [];
  const boqItemDefinitions = Array.isArray(ontology.boqItemDefinitions) ? ontology.boqItemDefinitions : [];
  if (!Array.isArray(ontology.departments)) issues.push({ code: 'INVALID_DEPARTMENTS_COLLECTION' });
  if (!Array.isArray(ontology.disciplines)) issues.push({ code: 'INVALID_DISCIPLINES_COLLECTION' });
  if (!Array.isArray(ontology.workGroups)) issues.push({ code: 'INVALID_WORK_GROUPS_COLLECTION' });
  if (!Array.isArray(ontology.boqItemDefinitions)) issues.push({ code: 'INVALID_BOQ_DEFINITIONS_COLLECTION' });

  for (const department of departments) validateIdentity(department, 'department', issues);
  for (const discipline of disciplines) validateIdentity(discipline, 'discipline', issues);
  for (const workGroup of workGroups) validateIdentity(workGroup, 'workGroup', issues);
  for (const definition of boqItemDefinitions) validateIdentity(definition, 'boqItemDefinition', issues);

  for (const [records, entityType] of [
    [departments, 'department'],
    [disciplines, 'discipline'],
    [workGroups, 'workGroup'],
    [boqItemDefinitions, 'boqItemDefinition'],
  ]) {
    validateUnique(records, 'id', entityType, 'DUPLICATE_TECHNICAL_ID', issues);
    validateUnique(records, 'code', entityType, 'DUPLICATE_READABLE_CODE', issues);
  }

  const departmentIds = new Set(departments.map(item => item.id));
  const disciplineIds = new Set(disciplines.map(item => item.id));
  const workGroupIds = new Set(workGroups.map(item => item.id));
  for (const discipline of disciplines) {
    if (!departmentIds.has(discipline.departmentId)) {
      issues.push({ code: 'UNKNOWN_DEPARTMENT', entityType: 'discipline', entityId: discipline.id ?? null, referenceId: discipline.departmentId ?? null });
    }
    if (typeof discipline.scopeSelectable !== 'boolean' || typeof discipline.budgetSelectable !== 'boolean') {
      issues.push({ code: 'INVALID_DISCIPLINE_SELECTABILITY', entityType: 'discipline', entityId: discipline.id ?? null });
    }
  }
  for (const workGroup of workGroups) {
    if (!disciplineIds.has(workGroup.disciplineId)) {
      issues.push({
        code: 'UNKNOWN_DISCIPLINE',
        entityType: 'workGroup',
        entityId: workGroup.id ?? null,
        referenceId: workGroup.disciplineId ?? null,
      });
    }
  }
  for (const definition of boqItemDefinitions) {
    if (!workGroupIds.has(definition.workGroupId)) {
      issues.push({
        code: 'UNKNOWN_WORK_GROUP',
        entityType: 'boqItemDefinition',
        entityId: definition.id ?? null,
        referenceId: definition.workGroupId ?? null,
      });
    }
  }

  return issues;
}

export function buildWorkOntologyIndex(ontology) {
  const issues = validateWorkOntology(ontology);
  if (issues.length > 0) {
    const error = new Error('INVALID_WORK_ONTOLOGY');
    error.code = 'INVALID_WORK_ONTOLOGY';
    error.issues = issues;
    throw error;
  }

  return {
    departmentsById: new Map(ontology.departments.map(item => [item.id, item])),
    disciplinesById: new Map(ontology.disciplines.map(item => [item.id, item])),
    workGroupsById: new Map(ontology.workGroups.map(item => [item.id, item])),
    boqItemDefinitionsById: new Map(ontology.boqItemDefinitions.map(item => [item.id, item])),
  };
}

/**
 * Deterministically aggregates detailed project BOQ rows to Work Groups.
 * Standard rows may reference a definition; custom rows still must carry a
 * valid Work Group id. The output follows ontology order, never input order.
 */
export function aggregateBoqItemsToWorkGroups(projectBoqItems, ontology) {
  const index = buildWorkOntologyIndex(ontology);
  if (!Array.isArray(projectBoqItems)) {
    const error = new Error('INVALID_PROJECT_BOQ_ITEMS');
    error.code = 'INVALID_PROJECT_BOQ_ITEMS';
    throw error;
  }

  const selected = new Set();
  for (const item of projectBoqItems) {
    const definition = item?.definitionId
      ? index.boqItemDefinitionsById.get(item.definitionId)
      : null;
    if (item?.definitionId && !definition) {
      const error = new Error('UNKNOWN_BOQ_ITEM_DEFINITION');
      error.code = 'UNKNOWN_BOQ_ITEM_DEFINITION';
      error.referenceId = item.definitionId;
      throw error;
    }

    const workGroupId = item?.workGroupId ?? definition?.workGroupId;
    if (!index.workGroupsById.has(workGroupId)) {
      const error = new Error('UNKNOWN_WORK_GROUP');
      error.code = 'UNKNOWN_WORK_GROUP';
      error.referenceId = workGroupId ?? null;
      throw error;
    }
    if (definition && item?.workGroupId && item.workGroupId !== definition.workGroupId) {
      const error = new Error('BOQ_WORK_GROUP_MISMATCH');
      error.code = 'BOQ_WORK_GROUP_MISMATCH';
      error.referenceId = item.definitionId;
      throw error;
    }
    selected.add(workGroupId);
  }

  return ontology.workGroups.filter(workGroup => selected.has(workGroup.id));
}

/**
 * Validates explicit mappings from the existing Execution Work Library to
 * canonical Work Groups. Mapping by labels or string similarity is never a
 * supported source-of-truth path.
 */
export function validateExecutionWorkMappings(
  mappings,
  ontology,
  knownExecutionWorkPackageIds = null,
) {
  const ontologyIssues = validateWorkOntology(ontology);
  if (ontologyIssues.length > 0) {
    return [{ code: 'INVALID_WORK_ONTOLOGY', issues: ontologyIssues }];
  }
  if (!Array.isArray(mappings)) return [{ code: 'INVALID_EXECUTION_MAPPING_COLLECTION' }];

  const issues = [];
  const workGroupIds = new Set(ontology.workGroups.map(item => item.id));
  const knownIds = knownExecutionWorkPackageIds == null
    ? null
    : new Set(knownExecutionWorkPackageIds);
  const seenExecutionIds = new Set();

  for (const mapping of mappings) {
    const executionId = mapping?.executionWorkPackageId;
    if (!isNonEmptyString(executionId)) {
      issues.push({ code: 'INVALID_EXECUTION_WORK_PACKAGE_ID', value: executionId ?? null });
      continue;
    }
    if (seenExecutionIds.has(executionId)) {
      issues.push({ code: 'DUPLICATE_EXECUTION_WORK_MAPPING', value: executionId });
    }
    seenExecutionIds.add(executionId);
    if (knownIds && !knownIds.has(executionId)) {
      issues.push({ code: 'UNKNOWN_EXECUTION_WORK_PACKAGE', value: executionId });
    }
    if (!workGroupIds.has(mapping?.workGroupId)) {
      issues.push({
        code: 'UNKNOWN_WORK_GROUP',
        entityType: 'executionWorkMapping',
        entityId: executionId,
        referenceId: mapping?.workGroupId ?? null,
      });
    }
  }

  return issues;
}

/**
 * Resolves selected execution works to a deterministic Work Group set.
 * Every selected execution work must have an explicit, valid mapping.
 */
export function aggregateExecutionWorksToWorkGroups(executionWorkPackageIds, mappings, ontology) {
  const mappingIssues = validateExecutionWorkMappings(mappings, ontology);
  if (mappingIssues.length > 0) {
    const error = new Error('INVALID_EXECUTION_WORK_MAPPINGS');
    error.code = 'INVALID_EXECUTION_WORK_MAPPINGS';
    error.issues = mappingIssues;
    throw error;
  }
  if (!Array.isArray(executionWorkPackageIds)) {
    const error = new Error('INVALID_EXECUTION_WORK_PACKAGE_IDS');
    error.code = 'INVALID_EXECUTION_WORK_PACKAGE_IDS';
    throw error;
  }

  const mappingsByExecutionId = new Map(
    mappings.map(mapping => [mapping.executionWorkPackageId, mapping.workGroupId]),
  );
  const selectedWorkGroupIds = new Set();
  for (const executionId of executionWorkPackageIds) {
    const workGroupId = mappingsByExecutionId.get(executionId);
    if (!workGroupId) {
      const error = new Error('UNMAPPED_EXECUTION_WORK_PACKAGE');
      error.code = 'UNMAPPED_EXECUTION_WORK_PACKAGE';
      error.referenceId = executionId ?? null;
      throw error;
    }
    selectedWorkGroupIds.add(workGroupId);
  }

  return ontology.workGroups.filter(workGroup => selectedWorkGroupIds.has(workGroup.id));
}

const EXECUTION_CLASSIFICATION_KINDS = new Set(['mapped', 'deferred', 'lifecycle']);

/**
 * Validates a complete classification register for an Execution Work Library.
 * Every known execution id must appear exactly once. Included work targets a
 * Work Group; deferred/lifecycle entries carry an explicit reason code.
 */
export function validateExecutionWorkClassifications(
  classifications,
  ontology,
  knownExecutionWorkPackageIds,
) {
  const ontologyIssues = validateWorkOntology(ontology);
  if (ontologyIssues.length > 0) {
    return [{ code: 'INVALID_WORK_ONTOLOGY', issues: ontologyIssues }];
  }
  if (!Array.isArray(classifications)) return [{ code: 'INVALID_EXECUTION_CLASSIFICATION_COLLECTION' }];
  if (!Array.isArray(knownExecutionWorkPackageIds)) return [{ code: 'INVALID_KNOWN_EXECUTION_ID_COLLECTION' }];

  const issues = [];
  const knownIds = new Set(knownExecutionWorkPackageIds);
  const workGroupIds = new Set(ontology.workGroups.map(item => item.id));
  const seen = new Set();

  for (const classification of classifications) {
    const executionId = classification?.executionWorkPackageId;
    if (!isNonEmptyString(executionId)) {
      issues.push({ code: 'INVALID_EXECUTION_WORK_PACKAGE_ID', value: executionId ?? null });
      continue;
    }
    if (seen.has(executionId)) {
      issues.push({ code: 'DUPLICATE_EXECUTION_WORK_CLASSIFICATION', value: executionId });
    }
    seen.add(executionId);
    if (!knownIds.has(executionId)) {
      issues.push({ code: 'UNKNOWN_EXECUTION_WORK_PACKAGE', value: executionId });
    }
    if (!EXECUTION_CLASSIFICATION_KINDS.has(classification.kind)) {
      issues.push({ code: 'INVALID_EXECUTION_CLASSIFICATION_KIND', value: classification.kind ?? null, entityId: executionId });
      continue;
    }
    if (classification.kind === 'mapped') {
      if (!workGroupIds.has(classification.workGroupId)) {
        issues.push({ code: 'UNKNOWN_WORK_GROUP', entityType: 'executionWorkClassification', entityId: executionId, referenceId: classification.workGroupId ?? null });
      }
      if (classification.reasonCode != null) {
        issues.push({ code: 'MAPPED_CLASSIFICATION_HAS_REASON', entityId: executionId });
      }
    } else {
      if (!isNonEmptyString(classification.reasonCode)) {
        issues.push({ code: 'MISSING_CLASSIFICATION_REASON', entityId: executionId });
      }
      if (classification.workGroupId != null) {
        issues.push({ code: 'EXCLUDED_CLASSIFICATION_HAS_WORK_GROUP', entityId: executionId });
      }
    }
  }

  for (const knownId of knownIds) {
    if (!seen.has(knownId)) issues.push({ code: 'UNCLASSIFIED_EXECUTION_WORK_PACKAGE', value: knownId });
  }
  return issues;
}

export function resolveExecutionWorkClassification(executionWorkPackageId, classifications) {
  const classification = Array.isArray(classifications)
    ? classifications.find(item => item.executionWorkPackageId === executionWorkPackageId)
    : null;
  if (!classification) {
    const error = new Error('UNCLASSIFIED_EXECUTION_WORK_PACKAGE');
    error.code = 'UNCLASSIFIED_EXECUTION_WORK_PACKAGE';
    error.referenceId = executionWorkPackageId ?? null;
    throw error;
  }
  return classification;
}
