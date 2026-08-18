import { COST_PACKAGE_STATUSES, PROCUREMENT_METHODS, buildCostPackagePayload, createCostPackageDraft, groupCostPackageScope, validateCostPackageDraft } from '../domains/commercial/costPackageModel.js';
import { PROCUREMENT_ROUTES, assessProcurementStrategyDraft, buildProcurementStrategyCommand, buildProcurementStrategyDraftPresentation, buildProcurementStrategySections, createProcurementStrategyDraft, patchProcurementStrategyDraft } from '../domains/commercial/procurementStrategyModel.js';

export const BOQ_MODES = Object.freeze([
  { value: 'CONTRACTOR_MEASURED', label: 'Contractor Measured', description: 'Contractor builds quantities; Consultant Qty is hidden.' },
  { value: 'CONSULTANT_MEASURED', label: 'Consultant Measured', description: 'Consultant BOQ is reviewed and frozen before invitation.' },
]);

function packageDraftFromRecord(record) {
  return {
    costPackageId: record.costPackageId,
    code: record.code,
    name: record.name,
    procurementMethod: record.procurementMethod,
    currencyCode: record.currencyCode,
    status: record.status,
    workGroupIds: record.workGroupIds || [],
    note: record.note || '',
    expectedRevision: record.revision,
  };
}

function getPersonInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export function buildCommercialFoundationView({ project, commercial, team, ontology, procurementStrategy }) {
  const costPackages = commercial?.costPackages || [];
  const methodLabels = Object.fromEntries(PROCUREMENT_METHODS.map(item => [item.value, item.label]));
  const memberships = (team?.memberships || []).map(item => ({
    ...item,
    initials: getPersonInitials(item.name),
    periodLabel: `${item.startsOn} → ${item.endsOn || 'Closeout'}`,
    packageCount: (item.costPackageIds || []).length,
  }));
  const tenderPackages = (commercial?.tenderPackages || []).map(item => ({
    ...item,
    procurementMethodLabel: methodLabels[item.procurementMethod] || item.procurementMethod,
    boqModeLabel: BOQ_MODES.find(mode => mode.value === item.boqMode)?.label || item.boqMode,
    packageCount: (item.costPackageIds || []).length,
    canEdit: item.status === 'DRAFT',
  }));
  const strategySections = buildProcurementStrategySections(ontology, procurementStrategy?.sections);
  return {
    project: { id: project.id, code: project.storeCode, currencyCode: commercial?.currencyCode || project.currencyCode },
    procurementMethods: PROCUREMENT_METHODS,
    procurementRoutes: PROCUREMENT_ROUTES,
    procurementStrategySections: strategySections,
    procurementStrategyConfiguredCount: strategySections.filter(section => section.configured).length,
    procurementStrategyTenderCount: strategySections.filter(section => section.tenderEligible).length,
    costPackageStatuses: COST_PACKAGE_STATUSES,
    scopeSections: groupCostPackageScope(ontology),
    costPackages: costPackages.map(item => ({ ...item, procurementMethodLabel: methodLabels[item.procurementMethod] || item.procurementMethod, scopeCount: (item.workGroupIds || []).length, canEdit: !['COMMITTED', 'CLOSED', 'ARCHIVED'].includes(item.status) })),
    costPackageCount: costPackages.length,
    hasCostPackages: costPackages.length > 0,
    tenderPackages,
    tenderPackageCount: tenderPackages.length,
    hasTenderPackages: tenderPackages.length > 0,
    boqModes: BOQ_MODES,
    availableUsers: (team?.availableUsers || []).map(item => ({ ...item, initials: getPersonInitials(item.name) })),
    departments: team?.departments || [],
    memberships,
    hasMemberships: memberships.length > 0,
  };
}

export function createStrategyDraft(view) { return createProcurementStrategyDraft(view.procurementStrategySections); }
export function changeStrategyDraft(draft, sectionCode, procurementMethod) { return patchProcurementStrategyDraft(draft, sectionCode, procurementMethod); }
export function inspectStrategyDraft(draft) { return assessProcurementStrategyDraft(draft); }
export function getStrategyCommand(draft) { return buildProcurementStrategyCommand(draft); }
export function presentStrategyDraft(view, draft) { return buildProcurementStrategyDraftPresentation(view?.procurementStrategySections, draft); }

function tenderDraftFromRecord(record) {
  return { tenderId: record.tenderId, tenderNumber: record.tenderNumber, costPackageIds: record.costPackageIds || [], procurementMethod: record.procurementMethod, boqMode: record.boqMode, expectedRevision: record.commercialRevision };
}

export function createNewTenderPackageDraft(view, id) {
  const available = view.costPackages.filter(item => item.status !== 'ARCHIVED');
  return { tenderId: id, tenderNumber: `${view.project.code || 'PROJECT'}-T${String(view.tenderPackageCount + 1).padStart(2, '0')}`, costPackageIds: [], procurementMethod: available[0]?.procurementMethod || 'COMPETITIVE_TENDER', boqMode: 'CONTRACTOR_MEASURED', expectedRevision: 0 };
}

export function selectTenderPackageDraft(view, id) {
  const record = view.tenderPackages.find(item => item.tenderId === id);
  return record ? tenderDraftFromRecord(record) : null;
}

export function patchTenderPackageDraft(draft, patch) { return { ...draft, ...patch }; }
export function toggleTenderCostPackage(draft, id) {
  const exists = draft.costPackageIds.includes(id);
  return { ...draft, costPackageIds: exists ? draft.costPackageIds.filter(value => value !== id) : [...draft.costPackageIds, id] };
}
export function assessTenderPackageDraft(view, draft) {
  const issues = [];
  if (!draft) return { issues, hasIssues: false, canSave: false };
  if (!draft.tenderId) issues.push({ code: 'TENDER_ID_REQUIRED' });
  if (!draft.tenderNumber?.trim()) issues.push({ code: 'TENDER_NUMBER_REQUIRED' });
  if (!PROCUREMENT_METHODS.some(item => item.value === draft.procurementMethod)) issues.push({ code: 'TENDER_METHOD_REQUIRED' });
  if (!BOQ_MODES.some(item => item.value === draft.boqMode)) issues.push({ code: 'TENDER_BOQ_MODE_REQUIRED' });
  if (!draft.costPackageIds.length) issues.push({ code: 'TENDER_COST_PACKAGE_REQUIRED' });
  const selected = view.costPackages.filter(item => draft.costPackageIds.includes(item.costPackageId));
  if (selected.length !== draft.costPackageIds.length) issues.push({ code: 'TENDER_COST_PACKAGE_INVALID' });
  if (selected.some(item => item.procurementMethod !== draft.procurementMethod)) issues.push({ code: 'TENDER_PROCUREMENT_METHOD_MISMATCH' });
  return { issues, hasIssues: issues.length > 0, canSave: issues.length === 0 };
}
export function getTenderPackageCommand(view, draft) {
  const assessment = assessTenderPackageDraft(view, draft);
  if (!assessment.canSave) throw Object.assign(new Error('INVALID_TENDER_PACKAGE'), { code: 'INVALID_TENDER_PACKAGE', issues: assessment.issues });
  return { ...draft, tenderNumber: draft.tenderNumber.trim().toUpperCase() };
}

export function createNewCostPackageDraft(view, id) {
  return createCostPackageDraft(view.project, view.costPackages.length + 1, id);
}

export function selectCostPackageDraft(view, id) {
  const record = view.costPackages.find(item => item.costPackageId === id);
  return record ? packageDraftFromRecord(record) : null;
}

export function patchCostPackageDraft(draft, patch) {
  return { ...draft, ...patch };
}

export function toggleCostPackageWorkGroup(draft, workGroupId) {
  const exists = draft.workGroupIds.includes(workGroupId);
  return { ...draft, workGroupIds: exists ? draft.workGroupIds.filter(id => id !== workGroupId) : [...draft.workGroupIds, workGroupId] };
}

export function getCostPackageIssues(draft) {
  return draft ? validateCostPackageDraft(draft) : [];
}

export function assessCostPackageDraft(draft) {
  const issues = getCostPackageIssues(draft);
  return { issues, hasIssues: issues.length > 0, canSave: Boolean(draft) && issues.length === 0 };
}

export function getCostPackageCommand(draft) {
  return buildCostPackagePayload(draft);
}

export function createNewMembershipDraft(view, membershipId = null) {
  const membership = membershipId ? view?.memberships?.find(item => item.membershipId === membershipId) : null;
  return {
    membershipId: membership?.membershipId || null,
    userId: membership?.userId || '',
    departmentCode: membership?.departmentCode || view?.departments?.[0]?.code || '',
    expectedRevision: membership?.revision || 0,
  };
}

export function selectMembershipDraftRecord(view, draft) {
  if (!draft?.membershipId) return null;
  return view?.memberships?.find(item => item.membershipId === draft.membershipId) || null;
}

export function filterAvailableProjectUsers(view, query) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return view.availableUsers;
  return view.availableUsers.filter(user => [user.name, user.email, user.role]
    .some(value => String(value || '').toLowerCase().includes(normalized)));
}

export function patchMembershipDraft(draft, patch) { return { ...draft, ...patch }; }

export function getMembershipIssues(view, draft) {
  if (!draft) return [];
  const issues = [];
  if (!draft.userId) issues.push({ code: 'TEAM_USER_REQUIRED' });
  const editingMembership = draft.membershipId
    ? view.memberships.find(item => item.membershipId === draft.membershipId && item.userId === draft.userId)
    : null;
  if (draft.membershipId && !editingMembership) issues.push({ code: 'TEAM_MEMBERSHIP_NOT_AVAILABLE' });
  if (!draft.membershipId && draft.userId && !view.availableUsers.some(user => user.userId === draft.userId)) issues.push({ code: 'TEAM_USER_NOT_AVAILABLE' });
  if (!view.departments.some(item => item.code === draft.departmentCode)) issues.push({ code: 'TEAM_DEPARTMENT_REQUIRED' });
  return issues;
}

export function assessMembershipDraft(view, draft) {
  const issues = getMembershipIssues(view, draft);
  return { issues, hasIssues: issues.length > 0, canSave: Boolean(draft) && issues.length === 0 };
}

export function getMembershipCommand(view, draft) {
  const issues = getMembershipIssues(view, draft);
  if (issues.length) throw Object.assign(new Error('INVALID_PROJECT_TEAM_MEMBERSHIP'), { code: 'INVALID_PROJECT_TEAM_MEMBERSHIP', issues });
  return {
    membershipId: draft.membershipId,
    userId: draft.userId,
    departmentCode: draft.departmentCode,
    expectedRevision: draft.expectedRevision,
  };
}
