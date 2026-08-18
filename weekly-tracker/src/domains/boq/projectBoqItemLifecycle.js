const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value, code) {
  if (!UUID_PATTERN.test(value || '')) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return value;
}

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return value.trim();
}

function commercialFields(input) {
  return {
    quantity: input.quantity ?? null,
    consultantQuantity: input.consultantQuantity ?? null,
    labourRate: input.labourRate ?? null,
    materialRate: input.materialRate ?? null,
    contractorNote: input.contractorNote?.trim() || null,
    reference: input.reference?.trim() || null,
    specification: input.specification?.trim() || null,
    sortOrder: input.sortOrder,
  };
}

export function createStandardProjectBoqItem(input) {
  const definition = input?.definition;
  return {
    lineId: requiredUuid(input?.lineId, 'INVALID_BOQ_LINE_ID'),
    workGroupId: requiredUuid(definition?.workGroupId, 'INVALID_WORK_GROUP_ID'),
    itemKind: 'STANDARD',
    standardDefinitionId: requiredUuid(definition?.id, 'STANDARD_DEFINITION_REQUIRED'),
    description: requiredText(definition?.label, 'STANDARD_LABEL_REQUIRED'),
    unit: requiredText(definition?.defaultUnit, 'STANDARD_UNIT_REQUIRED'),
    ...commercialFields(input),
  };
}

export function createCustomProjectBoqItem(input) {
  return {
    lineId: requiredUuid(input?.lineId, 'INVALID_BOQ_LINE_ID'),
    workGroupId: requiredUuid(input?.workGroupId, 'INVALID_WORK_GROUP_ID'),
    itemKind: 'CUSTOM',
    standardDefinitionId: null,
    description: requiredText(input?.description, 'DESCRIPTION_REQUIRED'),
    unit: requiredText(input?.unit, 'UNIT_REQUIRED'),
    ...commercialFields(input),
  };
}

export function validateProjectBoqItemIdentityTransitions(previousItems, nextItems) {
  if (!Array.isArray(previousItems) || !Array.isArray(nextItems)) {
    return [{ code: 'INVALID_BOQ_ITEM_COLLECTION' }];
  }
  const previousByLineId = new Map(previousItems.map(item => [item.lineId, item]));
  const issues = [];
  for (const item of nextItems) {
    const previous = previousByLineId.get(item?.lineId);
    if (!previous) continue;
    if (previous.itemKind !== item.itemKind
      || previous.workGroupId !== item.workGroupId
      || (previous.standardDefinitionId ?? null) !== (item.standardDefinitionId ?? null)) {
      issues.push({ code: 'BOQ_LINE_IDENTITY_IMMUTABLE', lineId: item.lineId });
    }
    if (item.itemKind === 'STANDARD'
      && (previous.description !== item.description || previous.unit !== item.unit)) {
      issues.push({ code: 'STANDARD_BOQ_METADATA_IMMUTABLE', lineId: item.lineId });
    }
  }
  return issues;
}
