import { blankVariation, validateVariationDraft, VARIATION_REASONS, VARIATION_REJECTION_REASONS, VARIATION_STATUS_LABELS } from '../domains/variations/variationModel.js';

const money = (value, currency) => value == null ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

export function presentVariationPageContext(workspace) {
  return { ...workspace, backHref: workspace?.role === 'CONTRACTOR' ? '/contractor-select' : '/projects' };
}

export function createAdditionalWorkDraft(currencyCode) { return blankVariation(currencyCode); }
export function createAdditionalWorkEditDraft(item) { return { ...item, proposedAmount: item.proposedAmount ?? '', relatedActivityId: item.relatedActivityId || null }; }
export function patchAdditionalWorkDraft(draft, patch) { return { ...draft, ...patch }; }
export function inspectAdditionalWorkDraft(draft) { return validateVariationDraft(draft); }

export function buildAdditionalWorkTransition(item, action, form = {}) {
  return { action, approvedAmount: action === 'APPROVE' ? form.amount : null, rejectionReasonCode: action === 'REJECT' ? form.reason : null, comment: form.comment || '', revision: item.revision };
}

export function presentVariationWorkspace(workspace, draft) {
  const disciplines = [...new Map((workspace.scope || []).map(item => [item.disciplineId, { id: item.disciplineId, label: item.disciplineLabel }])).values()];
  const workGroups = (workspace.scope || []).filter(item => item.disciplineId === draft?.disciplineId);
  const variations = (workspace.variations || []).map(item => ({
    ...item,
    numberDisplay: `VAR-${String(item.variationNumber).padStart(3, '0')}`,
    scopeDisplay: `${item.disciplineLabel} · ${item.workGroupLabel}`,
    statusLabel: VARIATION_STATUS_LABELS[item.status],
    proposedDisplay: money(item.proposedAmount, item.currencyCode),
    approvedDisplay: item.approvedAmount == null ? '—' : money(item.approvedAmount, item.currencyCode),
    reasonLabel: VARIATION_REASONS.find(([code]) => code === item.reasonCode)?.[1] || item.reasonCode,
    instructionDisplay: item.instructionReference || '—',
    scheduleDisplay: `${item.scheduleImpactDays} days${item.scheduleImpactNote ? ` — ${item.scheduleImpactNote}` : ''}`,
    canEdit: workspace.canCreate && ['DRAFT','REVISION_REQUIRED'].includes(item.status),
    canSubmit: workspace.canCreate && item.status === 'DRAFT',
    evidenceEditable: ['DRAFT','REVISION_REQUIRED'].includes(item.status),
    reviewMode: workspace.canReview && item.status === 'SUBMITTED' ? 'SUBMITTED' : workspace.canReview && item.status === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : null,
    reviewActions: workspace.canReview && item.status === 'SUBMITTED' ? [{ id: 'START_REVIEW', label: 'Start review', className: 'btn' }, { id: 'APPROVE', label: 'Approve proposed amount', className: 'btn btn-success' }] : workspace.canReview && item.status === 'UNDER_REVIEW' ? [{ id: 'APPROVE', label: 'Approve variation', className: 'btn btn-success' }, { id: 'REQUEST_REVISION', label: 'Request revision', className: 'btn', requiresComment: true }, { id: 'REJECT', label: 'Reject', className: 'btn btn-danger', requiresReason: true }] : [],
  }));
  return {
    summary: [['New', workspace.summary.newCount], ['Pending', workspace.summary.pendingCount], ['Pending exposure', money(workspace.summary.pendingExposure, workspace.currencyCode)], ['Approved variations', money(workspace.summary.approvedVariations, workspace.currencyCode)]],
    canCreate: workspace.canCreate && !draft,
    hasVariations: variations.length > 0,
    variations,disciplines,workGroups,
    reasonOptions: VARIATION_REASONS.map(([value, label]) => ({ value, label })),
    rejectionReasonOptions: VARIATION_REJECTION_REASONS.map(([value, label]) => ({ value, label })),
    formTitle: draft?.revision ? 'Edit Additional Work' : 'New Additional Work',
  };
}

export function presentVariationExposure(exposure) {
  if (!exposure) return null;const currency = exposure.currencyCode;
  return { ...exposure, statusLabel: exposure.exposureReady ? 'ALIGNED' : 'ACTION REQUIRED', awardedDisplay: money(exposure.awardedContractValue, currency), approvedDisplay: money(exposure.approvedVariations, currency), committedDisplay: money(exposure.currentCommittedCost, currency), pendingDisplay: money(exposure.pendingExposure, currency), potentialDisplay: money(exposure.potentialCommittedCost, currency), currencyAlert: exposure.currencyAligned ? null : `${exposure.currencyMismatchCount} active variation(s) use a different currency. Totals are withheld until currencies are aligned.`, breakdownRows: (exposure.breakdown || []).map(row => ({ ...row, valueDisplay: `${money(row.approvedVariations, currency)} approved · ${money(row.pendingExposure, currency)} pending` })) };
}

export function presentCommercialReview(review, currency, bucketPresentation) {
  if (!review) return null;const cycle = review.openCycle;
  return { ...review, cycle, headerStatus: cycle ? 'OPEN' : review.reviewDue ? 'DUE' : `Next: ${review.nextReviewDue}`, summary: cycle ? [['Review', `#${cycle.reviewNumber}`],['Period', `${cycle.periodStart} — ${cycle.periodEnd}`],['Opening exposure', money(cycle.openingPendingExposure, currency)],['Approved at opening', money(cycle.openingApprovedVariations, currency)]] : [], buckets: (bucketPresentation?.buckets || []).map(bucket => ({ label: bucket, count: bucketPresentation.bucketCounts[bucket] })) };
}
