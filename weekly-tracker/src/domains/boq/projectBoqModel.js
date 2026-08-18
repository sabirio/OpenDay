const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^[0-9]+(?:\.[0-9]{1,6})?$/;

function decimalString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

export function validateProjectBoqRevision(input) {
  const issues = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [{ code: 'INVALID_BOQ_REVISION' }];
  if (!UUID_PATTERN.test(input.boqId || '')) issues.push({ code: 'INVALID_BOQ_ID' });
  if (typeof input.title !== 'string' || !input.title.trim()) issues.push({ code: 'BOQ_TITLE_REQUIRED' });
  if (!/^[A-Z]{3}$/.test(input.currencyCode || '')) issues.push({ code: 'INVALID_CURRENCY_CODE' });
  if (!Number.isInteger(input.expectedLatestRevision) || input.expectedLatestRevision < 0) issues.push({ code: 'INVALID_EXPECTED_REVISION' });
  if (!Array.isArray(input.items) || input.items.length === 0) return [...issues, { code: 'EMPTY_BOQ' }];

  const seen = new Set();
  input.items.forEach((item, index) => {
    const lineId = item?.lineId || '';
    if (!UUID_PATTERN.test(lineId)) issues.push({ code: 'INVALID_BOQ_LINE_ID', index });
    if (seen.has(lineId)) issues.push({ code: 'DUPLICATE_BOQ_LINE_ID', index, lineId });
    seen.add(lineId);
    if (!UUID_PATTERN.test(item?.workGroupId || '')) issues.push({ code: 'INVALID_WORK_GROUP_ID', index });
    if (!['STANDARD', 'CUSTOM'].includes(item?.itemKind)) issues.push({ code: 'INVALID_BOQ_ITEM_KIND', index });
    if (item?.itemKind === 'STANDARD' && !UUID_PATTERN.test(item?.standardDefinitionId || '')) issues.push({ code: 'STANDARD_DEFINITION_REQUIRED', index });
    if (item?.itemKind === 'CUSTOM' && item?.standardDefinitionId != null) issues.push({ code: 'CUSTOM_DEFINITION_FORBIDDEN', index });
    if (typeof item?.description !== 'string' || !item.description.trim()) issues.push({ code: 'DESCRIPTION_REQUIRED', index });
    if (typeof item?.unit !== 'string' || !item.unit.trim()) issues.push({ code: 'UNIT_REQUIRED', index });
    const quantity = item?.quantity == null || item.quantity === '' ? null : decimalString(item.quantity);
    if (quantity != null && (!DECIMAL_PATTERN.test(quantity) || Number(quantity) <= 0)) issues.push({ code: 'INVALID_QUANTITY', index });
    const consultantQuantity = item?.consultantQuantity == null ? null : decimalString(item.consultantQuantity);
    if (consultantQuantity != null && (!DECIMAL_PATTERN.test(consultantQuantity) || Number(consultantQuantity) < 0)) issues.push({ code: 'INVALID_CONSULTANT_QUANTITY', index });
    const labourRate = item?.labourRate == null ? null : decimalString(item.labourRate);
    const materialRate = item?.materialRate == null ? null : decimalString(item.materialRate);
    if (labourRate != null && (!DECIMAL_PATTERN.test(labourRate) || Number(labourRate) < 0)) issues.push({ code: 'INVALID_LABOUR_RATE', index });
    if (materialRate != null && (!DECIMAL_PATTERN.test(materialRate) || Number(materialRate) < 0)) issues.push({ code: 'INVALID_MATERIAL_RATE', index });
    if (!Number.isInteger(item?.sortOrder) || item.sortOrder < 0) issues.push({ code: 'INVALID_SORT_ORDER', index });
  });
  return issues;
}

export function buildProjectBoqRevisionPayload(input) {
  const issues = validateProjectBoqRevision(input);
  if (issues.length > 0) {
    const error = new Error('INVALID_PROJECT_BOQ_REVISION');
    error.code = 'INVALID_PROJECT_BOQ_REVISION';
    error.issues = issues;
    throw error;
  }
  return {
    boqId: input.boqId,
    title: input.title.trim(),
    currencyCode: input.currencyCode,
    expectedLatestRevision: input.expectedLatestRevision,
    revisionNote: input.revisionNote?.trim() || null,
    items: [...input.items]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.lineId.localeCompare(b.lineId))
      .map(item => ({
        lineId: item.lineId,
        workGroupId: item.workGroupId,
        itemKind: item.itemKind,
        standardDefinitionId: item.standardDefinitionId ?? null,
        description: item.description.trim(),
        unit: item.unit.trim(),
        quantity: item.quantity == null || item.quantity === '' ? null : decimalString(item.quantity),
        consultantQuantity: item.consultantQuantity == null ? null : decimalString(item.consultantQuantity),
        labourRate: item.labourRate == null ? null : decimalString(item.labourRate),
        materialRate: item.materialRate == null ? null : decimalString(item.materialRate),
        contractorNote: item.contractorNote?.trim() || null,
        reference: item.reference?.trim() || null,
        specification: item.specification?.trim() || null,
        sortOrder: item.sortOrder,
      })),
  };
}
