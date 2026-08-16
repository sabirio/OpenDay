import { COST_PACKAGE_STATUSES, PROCUREMENT_METHODS, buildCostPackagePayload, createCostPackageDraft, groupCostPackageScope, validateCostPackageDraft } from '../domains/commercial/costPackageModel.js';

export const PROJECT_ROLES = Object.freeze(['PM', 'CONSULTANT', 'FUNCTION_OWNER', 'APPROVER', 'EXECUTIVE']);
export const RESPONSIBILITY_TYPES = Object.freeze(['OWNER', 'CONSULTANT', 'APPROVER', 'CONTRIBUTOR']);
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

function membershipDraftFromRecord(record) {
  return {
    membershipId: record.membershipId,
    userId: record.userId,
    projectRole: record.projectRole,
    responsibilityLabel: record.responsibilityLabel,
    startsOn: record.startsOn,
    endsOn: record.endsOn || '',
    notificationsEnabled: record.notificationsEnabled !== false,
    capabilityCodes: record.capabilityCodes || [],
    costPackageIds: record.costPackageIds || [],
    responsibilityType: record.responsibilityType || 'CONTRIBUTOR',
    expectedRevision: record.revision,
  };
}

export function buildCommercialFoundationView({ project, commercial, team, ontology }) {
  const costPackages = commercial?.costPackages || [];
  const methodLabels = Object.fromEntries(PROCUREMENT_METHODS.map(item => [item.value, item.label]));
  const capabilitiesByRole = Object.fromEntries(PROJECT_ROLES.map(role => [role, (team?.capabilityCatalog || []).filter(item => item.allowedProjectRoles.includes(role))]));
  const memberships = (team?.memberships || []).map(item => ({
    ...item,
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
  return {
    project: { id: project.id, code: project.storeCode, currencyCode: commercial?.currencyCode || project.currencyCode },
    procurementMethods: PROCUREMENT_METHODS,
    costPackageStatuses: COST_PACKAGE_STATUSES,
    scopeSections: groupCostPackageScope(ontology),
    costPackages: costPackages.map(item => ({ ...item, procurementMethodLabel: methodLabels[item.procurementMethod] || item.procurementMethod, scopeCount: (item.workGroupIds || []).length, canEdit: !['COMMITTED', 'CLOSED', 'ARCHIVED'].includes(item.status) })),
    costPackageCount: costPackages.length,
    hasCostPackages: costPackages.length > 0,
    tenderPackages,
    tenderPackageCount: tenderPackages.length,
    hasTenderPackages: tenderPackages.length > 0,
    boqModes: BOQ_MODES,
    capabilityCatalog: team?.capabilityCatalog || [],
    capabilitiesByRole,
    availableUsers: team?.availableUsers || [],
    memberships,
    hasMemberships: memberships.length > 0,
    projectRoles: PROJECT_ROLES,
    responsibilityTypes: RESPONSIBILITY_TYPES,
  };
}

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

function defaultCapabilities(catalog, projectRole) {
  return catalog.filter(item => item.allowedProjectRoles.includes(projectRole)).map(item => item.code);
}

export function createNewMembershipDraft(view, id, startsOn) {
  const initialRole = 'FUNCTION_OWNER';
  return {
    membershipId: id,
    userId: '',
    projectRole: initialRole,
    responsibilityLabel: '',
    startsOn,
    endsOn: '',
    notificationsEnabled: true,
    capabilityCodes: defaultCapabilities(view.capabilityCatalog, initialRole),
    costPackageIds: [],
    responsibilityType: 'OWNER',
    expectedRevision: 0,
  };
}

export function selectMembershipDraft(view, id) {
  const record = view.memberships.find(item => item.membershipId === id);
  return record ? membershipDraftFromRecord(record) : null;
}

export function patchMembershipDraft(view, draft, patch) {
  if (patch.projectRole && patch.projectRole !== draft.projectRole) {
    return { ...draft, ...patch, capabilityCodes: defaultCapabilities(view.capabilityCatalog, patch.projectRole) };
  }
  return { ...draft, ...patch };
}

export function toggleMembershipCapability(draft, capabilityCode) {
  const exists = draft.capabilityCodes.includes(capabilityCode);
  return { ...draft, capabilityCodes: exists ? draft.capabilityCodes.filter(code => code !== capabilityCode) : [...draft.capabilityCodes, capabilityCode] };
}

export function toggleMembershipCostPackage(draft, costPackageId) {
  const exists = draft.costPackageIds.includes(costPackageId);
  return { ...draft, costPackageIds: exists ? draft.costPackageIds.filter(id => id !== costPackageId) : [...draft.costPackageIds, costPackageId] };
}

export function getMembershipIssues(view, draft) {
  if (!draft) return [];
  const issues = [];
  if (!draft.userId) issues.push({ code: 'TEAM_USER_REQUIRED' });
  if (!PROJECT_ROLES.includes(draft.projectRole)) issues.push({ code: 'TEAM_ROLE_REQUIRED' });
  if (!draft.responsibilityLabel.trim()) issues.push({ code: 'TEAM_RESPONSIBILITY_REQUIRED' });
  if (!draft.startsOn) issues.push({ code: 'TEAM_START_DATE_REQUIRED' });
  if (draft.endsOn && draft.endsOn < draft.startsOn) issues.push({ code: 'TEAM_END_DATE_INVALID' });
  const allowed = new Set(view.capabilityCatalog.filter(item => item.allowedProjectRoles.includes(draft.projectRole)).map(item => item.code));
  if (draft.capabilityCodes.some(code => !allowed.has(code))) issues.push({ code: 'TEAM_CAPABILITY_NOT_ALLOWED' });
  const required = { PM: ['PROJECT_MANAGE', 'TEAM_MANAGE'], CONSULTANT: ['BOQ_PREPARE'], APPROVER: ['COMMERCIAL_APPROVE'], EXECUTIVE: ['EXECUTIVE_SUMMARY'] }[draft.projectRole] || [];
  if (required.some(code => !draft.capabilityCodes.includes(code))) issues.push({ code: 'TEAM_REQUIRED_CAPABILITY_MISSING' });
  if (draft.costPackageIds.some(id => !view.costPackages.some(item => item.costPackageId === id))) issues.push({ code: 'TEAM_PACKAGE_SCOPE_INVALID' });
  return issues;
}

export function assessMembershipDraft(view, draft) {
  const issues = getMembershipIssues(view, draft);
  return { issues, hasIssues: issues.length > 0, canSave: Boolean(draft) && issues.length === 0 };
}

export function getMembershipCommand(view, draft) {
  const issues = getMembershipIssues(view, draft);
  if (issues.length) throw Object.assign(new Error('INVALID_PROJECT_TEAM_MEMBERSHIP'), { code: 'INVALID_PROJECT_TEAM_MEMBERSHIP', issues });
  return { ...draft, endsOn: draft.endsOn || null };
}
