import { calculatedLineTotalDisplay, calculatedQuantityVarianceDisplay, groupProjectBoqItems, normalizeBoqDecimalInput } from '../boq/projectBoqEditorModel.js';

export function createBidRoundDraft(context) {
  return {
    bidRoundId: context.bidRoundId,
    roundNumber: context.roundNumber,
    deadlineAt: context.deadlineAt,
    draftRevision: context.draftRevision || 0,
    submitted: context.submitted === true,
    currencyCode: context.currencyCode,
    boqMode: context.boqMode || 'CONTRACTOR_MEASURED',
    items: (context.items || []).map(item => ({
      ...item,
      lineOrigin: item.lineOrigin || 'ISSUED',
      lineAction: item.lineAction || 'INCLUDED',
      contractorQuantity: item.contractorQuantity == null ? '' : String(item.contractorQuantity),
      consultantQuantity: item.consultantQuantity == null ? null : String(item.consultantQuantity),
      labourRate: item.labourRate == null ? '' : String(item.labourRate),
      materialRate: item.materialRate == null ? '' : String(item.materialRate),
      bidderNote: item.bidderNote || '',
    })),
  };
}

const validRate = value => value === '' || (/^\d+(?:\.\d{1,6})?$/.test(String(value)) && Number(value) >= 0);
const validQuantity = value => value === '' || (/^\d+(?:\.\d{1,6})?$/.test(String(value)) && Number(value) > 0);

export function validateBidRoundDraft(draft) {
  const issues = [];
  (draft.items || []).forEach((item, index) => {
    if (!['ISSUED', 'CONTRACTOR_ADDED'].includes(item.lineOrigin)) issues.push({ code: 'INVALID_LINE_ORIGIN', index });
    if (!['INCLUDED', 'EXCLUDED'].includes(item.lineAction)) issues.push({ code: 'INVALID_LINE_ACTION', index });
    if (item.lineOrigin === 'CONTRACTOR_ADDED' && String(item.description || '').trim().length < 2) issues.push({ code: 'CUSTOM_DESCRIPTION_REQUIRED', index });
    if (item.lineOrigin === 'CONTRACTOR_ADDED' && !String(item.unit || '').trim()) issues.push({ code: 'CUSTOM_UNIT_REQUIRED', index });
    if (item.lineAction === 'INCLUDED' && !validQuantity(item.contractorQuantity)) issues.push({ code: 'INVALID_CONTRACTOR_QUANTITY', index });
    if (item.lineAction === 'INCLUDED' && !validRate(item.labourRate)) issues.push({ code: 'INVALID_LABOUR_RATE', index });
    if (item.lineAction === 'INCLUDED' && !validRate(item.materialRate)) issues.push({ code: 'INVALID_MATERIAL_RATE', index });
  });
  if (!draft.items?.length) issues.push({ code: 'EMPTY_BID_DRAFT' });
  return issues;
}

export function buildBidDraftPayload(draft) {
  const issues = validateBidRoundDraft(draft);
  if (issues.length) {
    const error = new Error('INVALID_BID_DRAFT');
    error.code = 'INVALID_BID_DRAFT';
    error.issues = issues;
    throw error;
  }
  return {
    items: draft.items.map(item => ({
      lineId: item.lineId,
      workGroupId: item.workGroupId,
      description: item.description,
      unit: item.unit,
      lineOrigin: item.lineOrigin,
      lineAction: item.lineAction,
      quantity: item.lineAction === 'EXCLUDED' || item.contractorQuantity === '' ? null : String(item.contractorQuantity),
      labourRate: item.lineAction === 'EXCLUDED' || item.labourRate === '' ? null : String(item.labourRate),
      materialRate: item.lineAction === 'EXCLUDED' || item.materialRate === '' ? null : String(item.materialRate),
      bidderNote: item.bidderNote.trim() || null,
    })),
    expectedRevision: draft.draftRevision,
  };
}

export function summarizeBidDraft(draft) {
  return (draft.items || []).reduce((summary, item) => {
    summary.lineCount += 1;
    if (item.lineOrigin === 'CONTRACTOR_ADDED') summary.addedLineCount += 1;
    if (item.lineAction === 'EXCLUDED') {
      summary.excludedLineCount += 1;
      return summary;
    }
    const lineTotal = calculatedLineTotalDisplay({ quantity: item.contractorQuantity, labourRate: item.labourRate, materialRate: item.materialRate });
    if (item.labourRate !== '' || item.materialRate !== '') summary.pricedLineCount += 1;
    if (lineTotal != null) summary.total += Number(lineTotal);
    if (String(item.previousContractorQuantity ?? '') !== String(item.contractorQuantity)
      || String(item.previousLabourRate ?? '') !== String(item.labourRate)
      || String(item.previousMaterialRate ?? '') !== String(item.materialRate)) summary.changedLineCount += 1;
    return summary;
  }, { lineCount: 0, pricedLineCount: 0, changedLineCount: 0, addedLineCount: 0, excludedLineCount: 0, total: 0 });
}

export function patchBidRoundItem(draft, lineId, patch) {
  return { ...draft, items: draft.items.map(item => item.lineId === lineId ? { ...item, ...patch } : item) };
}

export function patchBidRoundDecimal(draft, lineId, field, rawValue) {
  const value = normalizeBoqDecimalInput(rawValue);
  return value == null ? draft : patchBidRoundItem(draft, lineId, { [field]: value });
}

export function appendContractorBidLine(draft, workGroupId, lineId) {
  const nextSort = Math.max(0, ...draft.items.filter(item => item.workGroupId === workGroupId).map(item => Number(item.sortOrder) || 0)) + 1;
  return {
    ...draft,
    items: [...draft.items, {
      lineId,
      workGroupId,
      description: '',
      unit: '',
      sortOrder: nextSort,
      lineOrigin: 'CONTRACTOR_ADDED',
      lineAction: 'INCLUDED',
      contractorQuantity: '',
      consultantQuantity: null,
      labourRate: '',
      materialRate: '',
      bidderNote: '',
      previousContractorQuantity: null,
      previousLabourRate: null,
      previousMaterialRate: null,
    }],
  };
}

export function setBidLineInclusion(draft, lineId, included) {
  return patchBidRoundItem(draft, lineId, { lineAction: included ? 'INCLUDED' : 'EXCLUDED' });
}

export function buildBidRoundPresentation(draft, groups = []) {
  if (!draft) return null;
  const issues = validateBidRoundDraft(draft);
  const summary = summarizeBidDraft(draft);
  const showConsultantQuantity = draft.boqMode === 'CONSULTANT_MEASURED';
  const presentedItems = draft.items.map(item => {
    const excluded = item.lineAction === 'EXCLUDED';
    const quantityVarianceDisplay = excluded ? null : calculatedQuantityVarianceDisplay({ quantity: item.contractorQuantity || null, consultantQuantity: item.consultantQuantity });
    return {
      ...item,
      isExcluded: excluded,
      isContractorAdded: item.lineOrigin === 'CONTRACTOR_ADDED',
      lineStatusLabel: excluded ? 'Excluded' : item.lineOrigin === 'CONTRACTOR_ADDED' ? 'Contractor added' : 'Included',
      totalDisplay: excluded ? 'Excluded' : calculatedLineTotalDisplay({ quantity: item.contractorQuantity, labourRate: item.labourRate, materialRate: item.materialRate }),
      quantityVarianceDisplay,
      quantityVarianceTone: quantityVarianceDisplay?.startsWith('+') ? 'is-positive' : quantityVarianceDisplay?.startsWith('−') ? 'is-negative' : '',
      labourChanged: String(item.previousLabourRate ?? '') !== String(item.labourRate),
      materialChanged: String(item.previousMaterialRate ?? '') !== String(item.materialRate),
      previousLabourDisplay: item.previousLabourRate == null ? '' : `Prev ${Number(item.previousLabourRate).toLocaleString()}`,
      previousMaterialDisplay: item.previousMaterialRate == null ? '' : `Prev ${Number(item.previousMaterialRate).toLocaleString()}`,
    };
  });
  const workGroups = groupProjectBoqItems(presentedItems, groups).map(group => ({ ...group, lineCount: group.items.length }));
  return {
    issues,
    hasIssues: issues.length > 0,
    summary: { ...summary, totalDisplay: summary.total.toLocaleString() },
    workGroups,
    workGroupCount: workGroups.length,
    lineCount: draft.items.length,
    showConsultantQuantity,
    isSubmitted: draft.submitted,
    canSave: !draft.submitted && issues.length === 0,
    canSubmit: !draft.submitted && draft.draftRevision > 0 && issues.length === 0,
    roundTitle: `Bid Round ${draft.roundNumber}`,
    roundDetail: `Deadline ${new Date(draft.deadlineAt).toLocaleString()} · Draft revision ${draft.draftRevision}`,
  };
}
