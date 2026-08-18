export const PROCUREMENT_METHODS = Object.freeze([
  { value: 'COMPETITIVE_TENDER', label: 'Competitive Tender', requiresTender: true },
  { value: 'FRAMEWORK_AGREEMENT', label: 'Framework Agreement', requiresTender: false },
  { value: 'DIRECT_AWARD', label: 'Direct Award / Single Source', requiresTender: false },
  { value: 'NOMINATED_SUPPLIER', label: 'Nominated Supplier', requiresTender: false },
  { value: 'EXISTING_CONTRACT', label: 'Existing Contract', requiresTender: false },
  { value: 'LANDLORD_PROVIDED', label: 'Landlord Provided Works', requiresTender: false },
  { value: 'INTERNAL_NON_PROCURED', label: 'Internal / Non-procured', requiresTender: false },
]);

export const COST_PACKAGE_STATUSES = Object.freeze(['DRAFT', 'ACTIVE', 'COMMITTED', 'CLOSED', 'ARCHIVED']);
const METHOD_VALUES = new Set(PROCUREMENT_METHODS.map(item => item.value));

export function createCostPackageDraft(project, sequence = 1, costPackageId) {
  if (!costPackageId) throw new Error('COST_PACKAGE_ID_REQUIRED');
  return {
    costPackageId,
    code: `CP-${String(sequence).padStart(3, '0')}`,
    name: '',
    procurementMethod: 'COMPETITIVE_TENDER',
    currencyCode: project.currencyCode || 'KZT',
    status: 'DRAFT',
    workGroupIds: [],
    note: '',
    expectedRevision: 0,
  };
}

export function procurementMethodRequiresTender(method) {
  return PROCUREMENT_METHODS.find(item => item.value === method)?.requiresTender === true;
}

export function validateCostPackageDraft(draft) {
  const issues = [];
  if (!draft.costPackageId) issues.push({ code: 'COST_PACKAGE_ID_REQUIRED' });
  if (!draft.code?.trim()) issues.push({ code: 'COST_PACKAGE_CODE_REQUIRED' });
  if (!draft.name?.trim()) issues.push({ code: 'COST_PACKAGE_NAME_REQUIRED' });
  if (!METHOD_VALUES.has(draft.procurementMethod)) issues.push({ code: 'INVALID_PROCUREMENT_METHOD' });
  if (!/^[A-Z]{3}$/.test(draft.currencyCode || '')) issues.push({ code: 'INVALID_CURRENCY_CODE' });
  if (!COST_PACKAGE_STATUSES.includes(draft.status)) issues.push({ code: 'INVALID_COST_PACKAGE_STATUS' });
  if (!Array.isArray(draft.workGroupIds) || draft.workGroupIds.length === 0) issues.push({ code: 'COST_PACKAGE_SCOPE_REQUIRED' });
  if (new Set(draft.workGroupIds || []).size !== (draft.workGroupIds || []).length) issues.push({ code: 'DUPLICATE_COST_PACKAGE_WORK_GROUP' });
  if ((draft.note || '').length > 4000) issues.push({ code: 'COST_PACKAGE_NOTE_TOO_LONG' });
  return issues;
}

export function buildCostPackagePayload(draft) {
  const issues = validateCostPackageDraft(draft);
  if (issues.length) {
    const error = new Error('INVALID_COST_PACKAGE');
    error.code = 'INVALID_COST_PACKAGE';
    error.issues = issues;
    throw error;
  }
  return {
    costPackageId: draft.costPackageId,
    code: draft.code.trim().toUpperCase(),
    name: draft.name.trim(),
    procurementMethod: draft.procurementMethod,
    currencyCode: draft.currencyCode,
    status: draft.status,
    workGroupIds: [...draft.workGroupIds],
    note: draft.note?.trim() || null,
    expectedRevision: Number(draft.expectedRevision || 0),
  };
}

export function groupCostPackageScope(ontology) {
  const disciplines = new Map((ontology?.disciplines || []).map(item => [item.id, { ...item, workGroups: [] }]));
  for (const group of ontology?.workGroups || []) {
    const discipline = disciplines.get(group.disciplineId);
    if (discipline) discipline.workGroups.push(group);
  }
  return [...disciplines.values()].sort((a, b) => a.displayOrder - b.displayOrder).map(item => ({
    ...item,
    workGroups: item.workGroups.sort((a, b) => a.displayOrder - b.displayOrder),
  }));
}
