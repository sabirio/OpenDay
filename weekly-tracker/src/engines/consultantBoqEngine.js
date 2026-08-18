const EDITABLE_STATUSES = new Set(['NOT_STARTED', 'DRAFT', 'RETURNED']);

function decimalText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function isDecimalInput(value) {
  return value === '' || /^\d{0,14}(?:\.\d{0,6})?$/.test(value);
}

function groupBy(items, keyOf) {
  const groups = [];
  const index = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!index.has(key)) {
      const group = { key, items: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).items.push(item);
  }
  return groups;
}

export function createConsultantBoqDraft(workspace) {
  return {
    ...workspace,
    revisionNote: '',
    reviewNote: '',
    items: (workspace?.items || []).map(item => ({ ...item, consultantQuantity: decimalText(item.consultantQuantity) })),
  };
}

export function patchConsultantQuantity(draft, lineId, value) {
  if (!isDecimalInput(value)) return draft;
  return { ...draft, items: draft.items.map(item => item.lineId === lineId ? { ...item, consultantQuantity: value } : item) };
}

export function patchConsultantBoqDraft(draft, patch) {
  return { ...draft, ...patch };
}

export function addConsultantCustomItem(draft, workGroupId, lineId) {
  const groupItem = draft.items.find(item => item.workGroupId === workGroupId);
  if (!groupItem) return draft;
  const custom = {
    ...groupItem,
    lineId,
    itemKind: 'CUSTOM',
    standardDefinitionId: null,
    description: '',
    specification: null,
    unit: '',
    consultantQuantity: '',
    reference: null,
    sortOrder: draft.items.length,
  };
  const finalIndex = draft.items.reduce((last, item, index) => item.workGroupId === workGroupId ? index : last, -1);
  return { ...draft, items: [...draft.items.slice(0, finalIndex + 1), custom, ...draft.items.slice(finalIndex + 1)] };
}

export function patchConsultantCustomItem(draft, lineId, patch) {
  const allowed = {};
  if (Object.hasOwn(patch, 'description')) allowed.description = patch.description;
  if (Object.hasOwn(patch, 'unit')) allowed.unit = patch.unit;
  if (Object.hasOwn(patch, 'specification')) allowed.specification = patch.specification;
  return { ...draft, items: draft.items.map(item => item.lineId === lineId && item.itemKind === 'CUSTOM' ? { ...item, ...allowed } : item) };
}

export function removeConsultantCustomItem(draft, lineId) {
  return { ...draft, items: draft.items.filter(item => item.itemKind !== 'CUSTOM' || item.lineId !== lineId) };
}

export function assessConsultantBoq(draft) {
  const items = draft?.items || [];
  const invalidCustom = items.filter(item => item.itemKind === 'CUSTOM' && (!item.description.trim() || !item.unit.trim())).length;
  const missingQuantity = items.filter(item => item.consultantQuantity === '').length;
  const canEdit = Boolean(draft?.canPrepare && EDITABLE_STATUSES.has(draft.status));
  return {
    canEdit,
    canSave: canEdit && items.length > 0 && invalidCustom === 0,
    canSubmit: canEdit && draft.revisionNumber > 0 && missingQuantity === 0 && invalidCustom === 0,
    canReview: Boolean(draft?.canReview && draft.status === 'SUBMITTED'),
    canReturn: Boolean(draft?.canReview && draft.status === 'SUBMITTED' && draft.reviewNote?.trim()),
    missingQuantity,
    invalidCustom,
    lineCount: items.length,
  };
}

export function buildConsultantBoqPresentation(draft) {
  if (!draft) return null;
  const assessment = assessConsultantBoq(draft);
  const disciplines = groupBy(draft.items, item => item.disciplineCode).map(discipline => ({
    code: discipline.key,
    label: discipline.items[0].disciplineLabel,
    lineCount: discipline.items.length,
    workGroups: groupBy(discipline.items, item => item.workGroupId).map(workGroup => ({
      id: workGroup.key,
      code: workGroup.items[0].workGroupCode,
      label: workGroup.items[0].workGroupLabel,
      lineCount: workGroup.items.length,
      items: workGroup.items,
    })),
  }));
  return {
    heading: `${draft.tenderNumber} · Consultant BOQ`,
    projectLabel: [draft.projectCode, draft.projectName].filter(Boolean).join(' · '),
    statusLabel: draft.status.replaceAll('_', ' '),
    revisionLabel: `R${draft.revisionNumber}`,
    assessment,
    disciplines,
    history: draft.events || [],
  };
}

export function getConsultantBoqSaveCommand(draft) {
  return {
    tenderId: draft.tenderId,
    consultantBoqId: draft.consultantBoqId,
    projectBoqId: draft.projectBoqId,
    expectedRevision: draft.revisionNumber,
    revisionNote: draft.revisionNote,
    items: draft.items.map((item, index) => ({
      lineId: item.lineId,
      workGroupId: item.workGroupId,
      itemKind: item.itemKind,
      standardDefinitionId: item.standardDefinitionId,
      description: item.description.trim(),
      specification: item.specification?.trim() || null,
      unit: item.unit.trim(),
      consultantQuantity: item.consultantQuantity === '' ? null : item.consultantQuantity,
      reference: item.reference?.trim() || null,
      sortOrder: index,
    })),
  };
}

export function buildConsultantAssignmentPresentation(assignments) {
  return (assignments || []).map(item => ({
    ...item,
    projectLabel: [item.projectCode, item.projectName].filter(Boolean).join(' · '),
    statusLabel: item.consultantStatus.replaceAll('_', ' '),
    revisionLabel: `R${item.revisionNumber}`,
  }));
}
