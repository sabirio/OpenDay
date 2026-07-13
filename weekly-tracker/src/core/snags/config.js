export const SNAG_WORKFLOW_VERSION = 1;
export const SNAG_SCHEMA_VERSION = 1;
export const SNAG_STATUSES = Object.freeze(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'CLOSED', 'CANCELLED']);
export const SNAG_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const DEFAULT_SNAG_CONFIG = Object.freeze({
  version: 'snags/default/1',
  categories: ['GENERAL'],
  disciplines: ['GENERAL'],
  priorities: SNAG_PRIORITIES,
  dueSoonDays: 7,
  evidenceRequiredForReview: false,
  contractorAcknowledgementRequired: false,
});
