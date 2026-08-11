// The sole domain-owned vocabulary for Contractor Report item evidence.
// SQL and presentation may validate/render these values, but must not invent
// additional meanings.
export const REPORT_ITEM_EVIDENCE_STATES = Object.freeze([
  'UPDATED',
  'CONFIRMED_UNCHANGED',
  'CARRIED_UNREVIEWED',
  'NOT_IN_REPORTING_SCOPE',
  'LEGACY_UNSPECIFIED',
]);

export const REPORT_ITEM_CONFIRMATION_MODES = Object.freeze(['INDIVIDUAL', 'BATCH']);

const stateSet = new Set(REPORT_ITEM_EVIDENCE_STATES);
const confirmationModeSet = new Set(REPORT_ITEM_CONFIRMATION_MODES);

export function assertReportItemEvidenceState(value, { allowLegacy = false } = {}) {
  if (!stateSet.has(value) || (!allowLegacy && value === 'LEGACY_UNSPECIFIED')) {
    throw new Error(`Invalid report item evidence state: ${value}`);
  }
  return value;
}

export function resolvePersistedReportItemEvidenceState(value) {
  return value == null ? 'LEGACY_UNSPECIFIED' : assertReportItemEvidenceState(value, { allowLegacy: true });
}

export function assertReportItemConfirmationMode(value) {
  if (value != null && !confirmationModeSet.has(value)) {
    throw new Error(`Invalid report item confirmation mode: ${value}`);
  }
  return value;
}

export function isFreshReportItemEvidence(state) {
  return state === 'UPDATED' || state === 'CONFIRMED_UNCHANGED';
}

export function isExplicitReportItemReview(state) {
  return state === 'UPDATED' || state === 'CONFIRMED_UNCHANGED';
}
