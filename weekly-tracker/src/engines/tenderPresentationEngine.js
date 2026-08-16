import { groupBidReviewItems, summarizeBidReviewRound } from '../domains/tender/bidReviewModel.js';
import { buildClarificationSubjectOptions, CLARIFICATION_SUBJECT_TYPES, CLARIFICATION_TYPES, summarizeClarifications, validateClarificationDraft } from '../domains/tender/clarificationModel.js';
import { getAwardCandidateIssues, validateTenderAward } from '../domains/tender/tenderAwardModel.js';
import { buildTenderComparison, formatComparisonPercent } from '../domains/tender/tenderComparisonModel.js';

const ISSUE_LABELS = { BID_NOT_SUBMITTED: 'Not submitted', BID_NOT_FULLY_PRICED: 'Missing prices', BID_NOT_REVIEWED: 'PM review incomplete', OPEN_CLARIFICATIONS: 'Open clarifications', APPROVAL_CAPABILITY_REQUIRED: 'Commercial Approver capability required' };
const REVIEW_LABELS = { NOT_STARTED: 'Not reviewed', IN_REVIEW: 'In review', REVIEWED: 'Reviewed' };
const CHANGE_LABELS = { FIRST_ROUND: 'First round', NEWLY_PRICED: 'Newly priced', PRICE_REMOVED: 'Price removed', RATE_CHANGED: 'Rate changed', UNCHANGED: 'Unchanged' };
const BUDGET_UNAVAILABLE = { APPROVED_BUDGET_BASELINE_REQUIRED: 'Approve a Budget Baseline before comparing it with Tender.', BUDGET_TENDER_ONTOLOGY_MISMATCH: 'Budget and Tender use different Work Ontology versions.', BUDGET_TENDER_CURRENCY_MISMATCH: 'Budget and Tender currencies differ. No implicit FX conversion is applied.', BUDGET_TENDER_SCOPE_GAP: 'One or more Tender Work Groups are missing from the Approved Budget.' };
const COMPARISON_LEVELS = [['WORK_GROUP', 'Category'], ['TOTAL', 'Total bid'], ['DISCIPLINE', 'Discipline'], ['ITEM', 'Line drill-down']];
const SETUP_ISSUE_LABELS = { TENDER_PACKAGE_REQUIRED: 'Create a Tender Package first.', TENDER_NUMBER_REQUIRED: 'Tender number is required.', TENDER_TITLE_REQUIRED: 'Title is required.', TENDER_DEADLINE_REQUIRED: 'Deadline is required.', INVALID_CURRENCY_CODE: 'Use a three-letter currency code.', TENDER_RULES_REQUIRED: 'Tender rules are required.', TENDER_INVITATION_MESSAGE_REQUIRED: 'Invitation message is required.', TENDER_INVITATION_MESSAGE_TOO_LONG: 'Invitation message must be 4,000 characters or fewer.', TENDER_BOQ_VERSION_REQUIRED: 'A frozen BOQ revision is required.', TENDER_SCOPE_REQUIRED: 'The issued BOQ must contain at least one Work Group.', TENDER_PARTICIPANT_REQUIRED: 'Add at least one participating contractor.', CONTRACTOR_NAME_REQUIRED: 'Contractor name is required.', INVALID_PARTICIPANT_EMAIL: 'Enter a valid contractor email.', DUPLICATE_TENDER_PARTICIPANT: 'Contractor emails must be unique.' };
const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^./, character => character.toUpperCase());
const money = (value, currency, maximumFractionDigits = 2) => value == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits }).format(Number(value));
const percent = value => formatComparisonPercent(value);
const cellTone = bid => bid?.missing ? 'is-missing' : bid?.excluded ? 'is-excluded' : bid?.isAnomaly ? 'is-anomaly' : bid?.isLowest ? 'is-lowest' : bid?.isHighest ? 'is-highest' : '';

export function presentTenderComparisonWorkspace(workspace, requestedRoundId) {
  const rounds = workspace?.rounds || [];
  const latest = rounds.at(-1);
  const round = rounds.find(item => String(item.bidRoundId) === String(requestedRoundId)) || latest;
  if (!round) return null;
  const comparison = buildTenderComparison(round);
  const bidderColumns = comparison.bidders.map(item => ({ id: item.id, label: item.contractorName }));
  const hierarchy = rows => rows.map(row => ({
    ...row,
    title: row.workGroupId ? `${row.workGroupCode} / ${row.workGroupLabel}` : row.disciplineLabel,
    subtitle: row.workGroupId ? row.disciplineLabel : '',
    budgetDisplay: money(row.budgetAmount, comparison.budgetCurrencyCode),
    consultantDisplay: row.consultantReferenceLineCount ? `${row.consultantReferenceLineCount} reference quantities` : 'No reference quantities',
    medianDisplay: money(row.median, comparison.currencyCode, 3),
    bidderCells: bidderColumns.map(column => {
      const bid = row.bidders.find(item => item.id === column.id);
      return bid ? { id: column.id, tone: cellTone(bid), primary: money(bid.value, comparison.currencyCode), secondary: `${bid.missingLineCount} missing · ${bid.excludedLineCount} excluded · ${bid.contractorAddedLineCount} added` } : { id: column.id, tone: 'is-missing', primary: 'No submission', secondary: '' };
    }),
  }));
  return {
    roundId: round.bidRoundId,
    roundOptions: [...rounds].reverse().map(item => ({ value: item.bidRoundId, label: `Round ${item.roundNumber} / ${item.status}` })),
    levels: COMPARISON_LEVELS.map(([id, title]) => ({ id, title })),
    bidderColumns,
    summary: [
      ['Accepted bidders', comparison.participantCount],
      ['Submitted', comparison.submittedCount],
      ['Missing bids', comparison.missingSubmissionCount],
      ['Median total', money(comparison.medianTotal, comparison.currencyCode, 3)],
      ['Approved scope budget', comparison.budgetComparisonAvailable ? money(comparison.scopeBudgetTotal, comparison.budgetCurrencyCode) : 'Unavailable'],
    ],
    budget: comparison.budgetComparisonAvailable ? { available: true, title: `Approved Budget coverage: ${comparison.budgetedWorkGroupCount}/${comparison.tenderScopeWorkGroupCount} Tender Work Groups.`, detail: `${comparison.baselineOutsideTenderCount} approved project Work Group(s) are outside this Tender and excluded from the variance.` } : { available: false, title: 'Budget variance unavailable', detail: BUDGET_UNAVAILABLE[comparison.budgetUnavailableReason] || 'Approved Budget comparison data is unavailable for this round.' },
    totalRows: comparison.bidders.map(bidder => ({
      ...bidder,
      rowTone: bidder.submitted ? '' : 'is-missing',
      totalTone: cellTone(bidder),
      statusDisplay: bidder.submitted ? 'Submitted' : 'Not submitted',
      totalDisplay: bidder.submitted ? money(bidder.total, comparison.currencyCode) : '—',
      budgetVarianceDisplay: bidder.budgetVariance == null ? '—' : money(bidder.budgetVariance, comparison.currencyCode),
      budgetVariancePctDisplay: bidder.budgetVariance == null ? '' : percent(bidder.budgetVarianceBps),
      rankDisplay: bidder.rank || '—',
      medianDisplay: bidder.submitted ? `${money(bidder.deviationFromMedian, comparison.currencyCode, 3)} / ${percent(bidder.deviationBps)}` : '—',
      missingDisplay: bidder.missingLineCount ?? '—',excludedDisplay: bidder.excludedLineCount ?? '—',addedDisplay: bidder.contractorAddedLineCount ?? '—',changedDisplay: bidder.changedLineCount ?? '—',
    })),
    disciplineRows: hierarchy(comparison.disciplines),
    categoryRows: hierarchy(comparison.categories),
    itemRows: comparison.items.map(item => ({
      ...item,
      title: item.description,
      subtitle: `${item.disciplineCode} / ${item.workGroupCode}${item.lineOrigin === 'CONTRACTOR_ADDED' ? ' · Contractor-added' : ''}`,
      consultantDisplay: item.consultantQuantity == null ? '—' : `${item.consultantQuantity} ${item.unit}`,
      medianDisplay: money(item.medianUnitRate, comparison.currencyCode, 6),
      medianDetail: `${item.pricedBidCount} priced bids${item.quantityMismatch ? ' · quantity mismatch' : ''}`,
      bidderCells: bidderColumns.map(column => {
        const bid = item.bidders.find(entry => entry.id === column.id);
        if (!bid) return { id: column.id, tone: 'is-missing', primary: 'No submission', detail: '', change: '' };
        return { id: column.id, tone: cellTone(bid), primary: bid.status, detail: bid.excluded ? 'Excluded from offer' : `${bid.contractorQuantity ?? '—'} ${item.unit} · ${money(bid.unitRate, comparison.currencyCode, 6)}`, change: `${bid.quantityVarianceBps == null ? '' : `${percent(bid.quantityVarianceBps)} qty variance · `}${label(bid.changeType)}` };
      }),
    })),
  };
}

export function presentTenderAward(workspace, selectedSubmissionId, note) {
  if (!workspace?.latestRound) return null;
  if (workspace.award) {
    const award = workspace.award;
    return { awarded: true, award: { ...award, awardedAtDisplay: new Date(award.awardedAt).toLocaleString(), contractValueDisplay: money(award.contractValue, award.currencyCode), baselineMessage: `Baseline ${award.commercialBaselineId} is linked to ${(award.costPackages || []).length} Cost Package(s) and cannot be edited.`, costPackages: (award.costPackages || []).map(item => ({ ...item, baselineValueDisplay: money(item.baselineValue, award.currencyCode) })), workGroups: (award.workGroups || []).map(item => ({ ...item, awardedTotalDisplay: money(item.awardedTotal, award.currencyCode) })), materializeConfirmMessage: `Create Execution Scope revision from ${award.lineCount} awarded BOQ lines collapsed into ${award.workGroupCount} Work Groups?` } };
  }
  const eligible = (workspace.candidates || []).filter(item => item.eligible);
  const selected = selectedSubmissionId || eligible[0]?.submissionId || '';
  const issues = validateTenderAward(workspace, selected, note);
  const candidate = (workspace.candidates || []).find(item => String(item.submissionId) === String(selected));
  return {
    awarded: false,selectedSubmissionId: selected,eligibleCount: eligible.length,issues,
    readyMessage: issues.length === 0 ? 'Ready to create immutable Awarded Contract and BOQ.' : `${issues.length} requirement(s) outstanding.`,
    canSubmit: issues.length === 0,
    confirmMessage: candidate ? `Award this tender to ${candidate.contractorName} for ${money(candidate.total, candidate.currencyCode)}? This creates an immutable commercial baseline.` : '',
    selectedCandidate: candidate || null,
    roundLabel: `Round ${workspace.latestRound.roundNumber} · ${workspace.latestRound.status}`,
    candidates: (workspace.candidates || []).map(item => ({ ...item, selected: String(selected) === String(item.submissionId), totalDisplay: item.submitted ? money(item.total, item.currencyCode) : 'No submitted bid', eligibilityTone: item.eligible ? 'is-active' : 'is-closed', eligibilityLabel: item.eligible ? 'ELIGIBLE' : getAwardCandidateIssues(item).map(code => ISSUE_LABELS[code]).join(' · ') })),
  };
}

export function presentTenderBidReview(workspace, requestedRoundId, requestedSubmissionId) {
  const rounds = workspace?.rounds || [];const latest = rounds.at(-1);if (!latest) return null;
  const round = rounds.find(item => String(item.bidRoundId) === String(requestedRoundId)) || latest;
  const submitted = (round?.participants || []).filter(item => item.submission);
  const selected = submitted.find(item => String(item.submission.submissionId) === String(requestedSubmissionId)) || submitted[0] || null;
  const summary = summarizeBidReviewRound(round);
  const currency = selected?.submission?.currencyCode;
  return {
    roundId: round.bidRoundId,selectedSubmissionId: selected?.submission?.submissionId || '',
    roundOptions: [...rounds].reverse().map(item => ({ value: item.bidRoundId, label: `Round ${item.roundNumber} · ${item.status}` })),
    summary: [['Submitted', `${summary.submittedCount}/${summary.participantCount}`],['Reviewed', `${summary.reviewedCount}/${summary.submittedCount}`],['Complete bids', `${summary.completeBidCount}/${summary.submittedCount}`],['Missing prices', summary.missingPriceCount],['Next round', summary.readyToClose ? 'Ready' : 'Blocked']],
    participants: (round?.participants || []).map(item => ({ ...item, disabled: !item.submission, selected: selected?.participantId === item.participantId, totalDisplay: item.submission ? money(item.submission.total, item.submission.currencyCode) : 'Awaiting submission', reviewTone: `is-${(item.submission?.reviewStatus || 'not-started').toLowerCase().replace('_', '-')}`, reviewLabel: item.submission ? REVIEW_LABELS[item.submission.reviewStatus] : 'NOT SUBMITTED' })),
    selected: selected ? {
      ...selected,
      submittedAtDisplay: new Date(selected.submission.submittedAt).toLocaleString(),
      pricedDisplay: `${selected.submission.pricedLineCount}/${selected.submission.lineCount} lines priced`,
      reviewActions: [{ id: 'IN_REVIEW', label: 'Mark in review', className: 'btn btn-secondary' }, { id: 'REVIEWED', label: 'Mark reviewed', className: 'btn btn-primary' }],
      groups: groupBidReviewItems(selected.submission.items).map(group => ({
        ...group,
        items: group.items.map(item => ({
          ...item,
          quantityDisplay: item.lineAction === 'EXCLUDED' ? 'Excluded' : item.quantity ?? '—',
          unitRateDisplay: item.lineAction === 'EXCLUDED' ? '—' : money(item.unitRate, currency, 6),
          totalDisplay: item.lineAction === 'EXCLUDED' ? '—' : money(item.lineTotal, currency),
          previousRateDisplay: money(item.previousUnitRate, currency, 6),
          changeDisplay: CHANGE_LABELS[item.changeType] || label(item.changeType),
          changeTone: ['UNCHANGED','FIRST_ROUND'].includes(item.changeType) ? '' : 'is-changed',
          rowTone: item.lineAction === 'EXCLUDED' ? 'is-excluded' : item.lineOrigin === 'CONTRACTOR_ADDED' ? 'is-contractor-added' : item.unitRate == null ? 'is-unpriced' : '',
        })),
      })),
    } : null,
  };
}

export function presentClarificationRegister(submission, workspace, draft) {
  const clarifications = (workspace?.clarifications || []).filter(item => item.bidSubmissionId === submission?.submissionId);
  const summary = summarizeClarifications(clarifications);
  const options = buildClarificationSubjectOptions(submission);
  const issues = validateClarificationDraft(draft);
  const targetOptions = draft.subjectType === 'LINE' ? options.lines : draft.subjectType === 'CATEGORY' ? options.categories : [];
  return { clarifications: clarifications.map(item => { const responded = item.status === 'RESPONDED';const closable = ['ACCEPTED','RESOLVED'].includes(item.status);return { ...item, subjectTypeLabel: label(item.subjectType || 'LINE'), typeLabel: label(item.type), statusLabel: label(item.status), tone: `is-${item.status.toLowerCase().replaceAll('_', '-')}`, setLabel: item.setNumber ? `Set ${item.setNumber}` : 'Draft', resolutionVisible: responded || closable, resolutionPlaceholder: responded ? 'Decision note' : 'Closure note', resolutionActions: responded ? [{ decision: 'REVISION_REQUIRED', label: 'Revision required', className: 'btn btn-secondary' }, { decision: 'ACCEPTED', label: 'Accept response', className: 'btn btn-primary' }] : closable ? [{ decision: 'CLOSED', label: 'Close clarification', className: 'btn btn-primary' }] : [] }; }), summary, subjectTypes: CLARIFICATION_SUBJECT_TYPES.map(value => ({ value, label: label(value) })), types: CLARIFICATION_TYPES.map(value => ({ value, label: label(value) })), targetOptions, subjectNote: `Applies to this ${label(draft.subjectType)} and selected contractor.`, issues, canCreate: issues.length === 0, canIssue: summary.draft > 0 };
}

export function presentBidderClarifications(items) {
  const presented = (items || []).map(item => ({ ...item, typeLabel: label(item.type), statusLabel: label(item.status), tone: `is-${item.status.toLowerCase().replaceAll('_', '-')}`, canRespond: ['OPEN','REVISION_REQUIRED'].includes(item.status), responsePlaceholder: item.status === 'REVISION_REQUIRED' ? 'Provide the requested revised response' : 'Enter your response' }));
  return { items: presented, awaitingResponseCount: presented.filter(item => item.canRespond).length };
}

export function presentTenderSetupEditor(context, draft, issues, invitationSaved) {
  const participants = (draft?.participants || []).map((item, index) => {
    const saved = (context?.participants || []).find(candidate => candidate.participantId === item.participantId && candidate.contactEmail.toLowerCase() === item.contactEmail.trim().toLowerCase());
    const access = (context?.bidderAccess || []).find(candidate => candidate.participantId === item.participantId);
    return { ...item, position: index + 1, saved: Boolean(saved), deliveryTone: access?.deliveryTone || 'is-not-sent', deliveryLabel: access?.deliveryLabel || 'NOT SENT', invitationTone: `is-${(access?.status || 'INVITED').toLowerCase()}`, invitationLabel: access?.statusLabel || 'NOT INVITED', sendLabel: access?.emailSentAt ? 'Resend' : 'Send invitation', canSend: Boolean(invitationSaved && saved), canRemove: draft.participants.length > 1 };
  });
  const prerequisites = { TENDER_PACKAGE_REQUIRED: { title: 'Tender Package required', detail: 'Create the Tender Package and link its Cost Package scope before Tender Setup.', actionLabel: 'Open Commercial setup', actionHref: `/projects/${context?.project?.id}/commercial-setup` }, CONSULTANT_BOQ_FREEZE_REQUIRED: { title: 'Consultant BOQ must be frozen', detail: 'The Consultant submits measured quantities and PM accepts the immutable revision before issue.', actionLabel: 'Open Consultant BOQ', actionHref: `/tenders/${context?.tender?.id}/consultant-boq` }, PROJECT_BOQ_REVISION_REQUIRED: { title: 'BOQ revision required', detail: 'Save a Project BOQ revision before Tender Setup.' } };
  return { prerequisite: prerequisites[context?.boqPrerequisite] || null, participants, showInvitationSaveWarning: Boolean(!invitationSaved && context?.latestSetup), canOpenRound: Boolean(context?.latestSetup && (context?.bidderAccess || []).some(access => access.status === 'ACCEPTED')), rounds: [...(context?.bidRounds || [])].reverse().map(round => ({ ...round, statusTone: `is-${round.status.toLowerCase()}`, deadlineDisplay: new Date(round.deadlineAt).toLocaleString() })), hasRounds: Boolean(context?.bidRounds?.length), openRoundLabel: context?.bidRounds?.length ? 'Open next round' : 'Open Bid Round 1', boqModeLabel: label(context?.boqMode), consultantMeasured: context?.boqMode === 'CONSULTANT_MEASURED', workGroupCount: context?.availableWorkGroups?.length || 0, invitationLengthDisplay: `${draft?.invitationMessage?.length || 0}/4000`, nextRevisionLabel: `Next save: Setup R${(draft?.expectedLatestRevision || 0) + 1}`, issueRows: (issues || []).slice(0, 8).map((issue,index)=>({ ...issue, key: `${issue.code}-${index}`, label: `${issue.index != null ? `Contractor ${issue.index + 1}: ` : ''}${SETUP_ISSUE_LABELS[issue.code] || issue.code}` })), hasIssues: (issues || []).length > 0, canSave: (issues || []).length === 0 };
}

export function presentTenderInvitationPreview(draft, project, participant) {
  return {
    contractorName: participant?.contractorName?.trim() || 'Contractor',
    invitationMessage: draft?.invitationMessage || '',
    projectCode: project?.storeCode || '—',
    tenderNumber: draft?.tenderNumber || '—',
    title: draft?.title || '—',
    deadlineDisplay: draft?.deadlineAt ? new Date(draft.deadlineAt).toLocaleString() : '—',
    currencyCode: draft?.currencyCode || '—',
  };
}
