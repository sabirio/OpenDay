import { buildProjectBoqRevisionPayload, validateProjectBoqRevision } from './projectBoqModel.js';
import { createCustomProjectBoqItem, createStandardProjectBoqItem } from './projectBoqItemLifecycle.js';

export function createProjectBoqDraft(context) {
  return {
    boqId: context.boq.id,
    title: context.boq.title,
    currencyCode: context.boq.currencyCode,
    expectedLatestRevision: context.latestVersion?.revisionNumber || 0,
    revisionNote: '',
    items: (context.items || []).map((item, index) => ({ ...item, sortOrder: index })),
  };
}

export function syncProjectBoqDraftWithStandardCatalogue(draft, context, createId) {
  const existing = new Set(draft.items.filter(item => item.standardDefinitionId).map(item => item.standardDefinitionId));
  const additions = (context.ontology?.boqItemDefinitions || [])
    .filter(definition => !existing.has(definition.id))
    .map((definition, index) => createStandardProjectBoqItem({
      lineId: createId(), definition, quantity: null, consultantQuantity: null, labourRate: null, materialRate: null,
      sortOrder: draft.items.length + index,
    }));
  return sortProjectBoqDraftItems({ ...draft, items: [...draft.items, ...additions] }, context.ontology);
}

export function groupProjectBoqItems(items, workGroups) {
  const groupsById = new Map((workGroups || []).map(group => [group.id, { ...group, items: [] }]));
  for (const item of items || []) {
    const group = groupsById.get(item.workGroupId);
    if (group) group.items.push(item);
  }
  return [...groupsById.values()]
    .filter(group => group.items.length > 0)
    .map(group => ({
      ...group,
      items: [...group.items].sort((left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)),
    }));
}

export function sortProjectBoqDraftItems(draft, ontology) {
  const departmentOrder = new Map((ontology?.departments || []).map(item => [item.id, item.displayOrder ?? Number.MAX_SAFE_INTEGER]));
  const disciplineMeta = new Map((ontology?.disciplines || []).map(item => [item.id, item]));
  const groupMeta = new Map((ontology?.workGroups || []).map(item => [item.id, item]));
  const definitionCode = new Map((ontology?.boqItemDefinitions || []).map(item => [item.id, item.code]));
  const items = [...(draft.items || [])].sort((left, right) => {
    const leftGroup = groupMeta.get(left.workGroupId) || {};
    const rightGroup = groupMeta.get(right.workGroupId) || {};
    const leftDiscipline = disciplineMeta.get(leftGroup.disciplineId) || {};
    const rightDiscipline = disciplineMeta.get(rightGroup.disciplineId) || {};
    return (departmentOrder.get(leftDiscipline.departmentId) ?? Number.MAX_SAFE_INTEGER) - (departmentOrder.get(rightDiscipline.departmentId) ?? Number.MAX_SAFE_INTEGER)
      || (leftDiscipline.displayOrder ?? Number.MAX_SAFE_INTEGER) - (rightDiscipline.displayOrder ?? Number.MAX_SAFE_INTEGER)
      || String(leftDiscipline.code || '').localeCompare(String(rightDiscipline.code || ''))
      || (leftGroup.displayOrder ?? Number.MAX_SAFE_INTEGER) - (rightGroup.displayOrder ?? Number.MAX_SAFE_INTEGER)
      || String(leftGroup.code || '').localeCompare(String(rightGroup.code || ''))
      || (left.itemKind === 'STANDARD' ? 0 : 1) - (right.itemKind === 'STANDARD' ? 0 : 1)
      || (left.itemKind === 'STANDARD' && right.itemKind === 'STANDARD'
        ? String(definitionCode.get(left.standardDefinitionId) || '').localeCompare(String(definitionCode.get(right.standardDefinitionId) || '')) : 0)
      || (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  }).map((item, index) => ({ ...item, sortOrder: index }));
  return { ...draft, items };
}

export function buildProjectBoqHierarchy(items, ontology) {
  const grouped = groupProjectBoqItems(items, ontology?.workGroups || []);
  const departmentOrder = new Map((ontology?.departments || []).map(item => [item.id, item.displayOrder ?? Number.MAX_SAFE_INTEGER]));
  const groupsByDiscipline = new Map();
  for (const group of grouped) {
    if (!groupsByDiscipline.has(group.disciplineId)) groupsByDiscipline.set(group.disciplineId, []);
    groupsByDiscipline.get(group.disciplineId).push(group);
  }
  const disciplines = [...(ontology?.disciplines || [])]
    .sort((left, right) =>
      (departmentOrder.get(left.departmentId) ?? Number.MAX_SAFE_INTEGER) - (departmentOrder.get(right.departmentId) ?? Number.MAX_SAFE_INTEGER)
        || (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER)
        || String(left.code).localeCompare(String(right.code)))
    .flatMap(discipline => {
      const groups = [...(groupsByDiscipline.get(discipline.id) || [])].sort((left, right) =>
        (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER)
          || String(left.code).localeCompare(String(right.code)));
      return groups.length ? [{ ...discipline, groups }] : [];
    });
  return { disciplines, groupCount: grouped.length, itemCount: (items || []).length };
}

export function createNewProjectBoqIdentity(project, createId) {
  return {
    id: createId(),
    projectId: project.id,
    ontologyVersionId: project.workOntologyVersionId,
    title: `${project.storeCode || 'Project'} BOQ`,
    currencyCode: project.currencyCode || 'KZT',
  };
}

export function addStandardBoqDraftItem(draft, definition, createId) {
  if (draft.items.some(item => item.standardDefinitionId === definition.id)) {
    const error = new Error('STANDARD_BOQ_ITEM_ALREADY_ADDED');
    error.code = 'STANDARD_BOQ_ITEM_ALREADY_ADDED';
    throw error;
  }
  return {
    ...draft,
    items: [...draft.items, createStandardProjectBoqItem({
      lineId: createId(), definition, quantity: null, consultantQuantity: null, labourRate: null, materialRate: null, sortOrder: draft.items.length,
    })],
  };
}

export function addCustomBoqDraftItem(draft, input, createId) {
  return {
    ...draft,
    items: [...draft.items, createCustomProjectBoqItem({
      lineId: createId(), workGroupId: input.workGroupId, description: input.description,
      unit: input.unit, quantity: input.quantity || null, consultantQuantity: input.consultantQuantity || null,
      labourRate: input.labourRate || null, materialRate: input.materialRate || null,
      contractorNote: null, reference: null, specification: null, sortOrder: draft.items.length,
    })],
  };
}

export function patchProjectBoqDraftItem(draft, lineId, patch) {
  return {
    ...draft,
    items: draft.items.map(item => item.lineId === lineId ? { ...item, ...patch } : item),
  };
}

export function removeProjectBoqDraftItem(draft, lineId) {
  return {
    ...draft,
    items: draft.items.filter(item => item.lineId !== lineId).map((item, index) => ({ ...item, sortOrder: index })),
  };
}

export function validateProjectBoqDraft(draft) {
  return validateProjectBoqRevision(draft);
}

export function buildNativeProjectBoqRevision(draft) {
  return buildProjectBoqRevisionPayload(draft);
}

export function projectBoqDraftIsDirty(draft, baseline) {
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}

export function savedLineTotalDisplay(item, baselineItem) {
  if (!baselineItem || item.quantity !== baselineItem.quantity
    || item.labourRate !== baselineItem.labourRate || item.materialRate !== baselineItem.materialRate) return null;
  return baselineItem.lineTotal ?? null;
}

function decimalAtSix(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

export function calculatedLineTotalDisplay(item) {
  if (item.labourRate == null && item.materialRate == null) return null;
  const quantity = decimalAtSix(item.quantity);
  const labour = item.labourRate == null ? 0n : decimalAtSix(item.labourRate);
  const material = item.materialRate == null ? 0n : decimalAtSix(item.materialRate);
  if (quantity == null || labour == null || material == null) return null;
  const cents = (quantity * (labour + material) + 5000000000n) / 10000000000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function calculatedQuantityVarianceDisplay(item) {
  if (item.quantity == null || item.consultantQuantity == null) return null;
  const contractor = decimalAtSix(item.quantity);
  const consultant = decimalAtSix(item.consultantQuantity);
  if (contractor == null || consultant == null || consultant <= 0n) return null;
  const numerator = (contractor - consultant) * 10000n;
  const basisPoints = numerator >= 0n
    ? (numerator + consultant / 2n) / consultant
    : -((-numerator + consultant / 2n) / consultant);
  const absolute = basisPoints < 0n ? -basisPoints : basisPoints;
  const sign = basisPoints > 0n ? '+' : basisPoints < 0n ? '−' : '';
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}%`;
}

export function normalizeBoqDecimalInput(rawValue) {
  const value = String(rawValue ?? '').replace(',', '.');
  return /^\d*(?:\.\d*)?$/.test(value) ? value : null;
}

export function presentProjectBoqLine(item) {
  const quantityVarianceDisplay = calculatedQuantityVarianceDisplay(item);
  return {
    ...item,
    calculatedTotalDisplay: calculatedLineTotalDisplay(item),
    quantityVarianceDisplay,
    quantityVarianceTone: quantityVarianceDisplay?.startsWith('+') ? 'is-positive' : quantityVarianceDisplay?.startsWith('−') ? 'is-negative' : '',
    isStandard: item.itemKind === 'STANDARD',
    isCustom: item.itemKind === 'CUSTOM',
  };
}

export function assessCustomBoqItem(input) {
  const issues = [];
  if (!input?.description?.trim()) issues.push({ code: 'DESCRIPTION_REQUIRED' });
  if (!input?.unit?.trim()) issues.push({ code: 'UNIT_REQUIRED' });
  return { issues, canAdd: issues.length === 0, presentation: presentProjectBoqLine(input || {}) };
}

export function buildProjectBoqPresentation({ draft, baseline, context, mode = 'CONSULTANT_MEASURED' }) {
  const hierarchy = buildProjectBoqHierarchy(draft?.items || [], context?.ontology);
  const summary = summarizeProjectBoqDraft(draft?.items || []);
  const currencyCode = context?.boq?.currencyCode || draft?.currencyCode || '';
  const disciplines = hierarchy.disciplines.map(discipline => ({
    ...discipline,
    groupCount: discipline.groups.length,
    groups: discipline.groups.map(group => ({
      ...group,
      lineCount: group.items.length,
      items: group.items.map(presentProjectBoqLine),
    })),
  }));
  const isLatest = context?.selectedVersion?.id === context?.latestVersion?.id || context?.latestVersion == null;
  const issues = draft ? validateProjectBoqDraft(draft) : [];
  const dirty = Boolean(draft && baseline && projectBoqDraftIsDirty(draft, baseline));
  return {
    hierarchy: { ...hierarchy, disciplines },
    isLatest,
    readOnly: !isLatest,
    showConsultantQuantity: mode === 'CONSULTANT_MEASURED',
    mode,
    issues,
    dirty,
    canSave: isLatest && dirty && issues.length === 0,
    saveRevisionLabel: `Save revision ${(draft?.expectedLatestRevision || 0) + 1}`,
    revisionLabel: `Revision ${context?.selectedVersion?.revisionNumber || 0}`,
    revisionDetail: context?.selectedVersion ? `${context.selectedVersion.sourceKind} · ${new Date(context.selectedVersion.createdAt).toLocaleString()}` : 'New BOQ — not saved yet',
    canExchangeExcel: Boolean(context?.latestVersion) && isLatest,
    title: context?.boq?.title || draft?.title || 'BOQ',
    currencyCode,
    summary: { ...summary, totalDisplay: formatBoqMoney(summary.total) },
    disciplineTotals: summarizeProjectBoqDisciplines(draft?.items || [], context?.ontology).map(item => ({ ...item, totalDisplay: formatBoqMoney(item.total) })),
    revisionHistory: [...(context?.versions || [])].reverse().map(version => ({ ...version, isActive: version.id === context?.selectedVersion?.id, label: `R${version.revisionNumber}` })),
    hasRevisionHistory: (context?.versions || []).length > 0,
    isHistorical: !isLatest,
  };
}

export function summarizeProjectBoqDraft(items) {
  let totalCents = 0n;
  let pricedLineCount = 0;
  for (const item of items || []) {
    const lineTotal = calculatedLineTotalDisplay(item);
    if (lineTotal == null) continue;
    const [whole, fraction] = lineTotal.split('.');
    totalCents += BigInt(whole) * 100n + BigInt(fraction);
    pricedLineCount += 1;
  }
  const lineCount = (items || []).length;
  return {
    total: `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, '0')}`,
    lineCount,
    pricedLineCount,
    unpricedLineCount: lineCount - pricedLineCount,
  };
}

export function summarizeProjectBoqDisciplines(items, ontology) {
  return buildProjectBoqHierarchy(items, ontology).disciplines.map(discipline => ({
    id: discipline.id,
    code: discipline.code,
    label: discipline.label,
    ...summarizeProjectBoqDraft(discipline.groups.flatMap(group => group.items)),
  }));
}

export function formatBoqMoney(value) {
  const [whole, fraction = '00'] = String(value).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${fraction}`;
}
