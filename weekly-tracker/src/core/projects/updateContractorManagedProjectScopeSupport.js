// Pure, network-free helpers for the atomic Contractor-Managed Scope-sync
// command (updateContractorManagedProjectScopeCommand.js). Split out for the
// same reason createContractorManagedProjectSupport.js is split out: the
// command module statically imports services/projectService.js, which
// imports lib/supabase.js (needs import.meta.env / a real Vite runtime), so
// it can never be loaded by this repo's plain-node *.test.mjs runner. See
// scripts/certification/certifyContractorManagedScopeSync.mjs for the
// RPC-calling behavior's actual (DB-backed) certification.
export { resolveActiveScopeWPIds } from './createContractorManagedProjectSupport.js';

// update_contractor_managed_project_scope()'s own canonical error vocabulary
// (053_contractor_managed_project_scope_sync.sql). Shares several codes with
// the create command (052) — EMPTY_SCOPE, INVALID_WORK_PACKAGE,
// DUPLICATE_WORK_PACKAGE, WORK_PACKAGE_OUT_OF_TEMPLATE, TEMPLATE_NOT_CONFIGURED,
// NOT_AUTHORIZED — but this command has its own additional lifecycle-lock
// and ownership-mode codes, so it keeps its own independent message map
// rather than importing createContractorManagedProjectSupport's (a genuinely
// distinct command, not a variant of the same one).
const SAFE_MESSAGES = {
  EMPTY_SCOPE: 'Select at least one work package before saving Scope.',
  INVALID_WORK_PACKAGE: 'The project scope is invalid. Please reload and try again.',
  DUPLICATE_WORK_PACKAGE: 'The project scope contains a duplicate work package. Please reload and try again.',
  WORK_PACKAGE_OUT_OF_TEMPLATE: 'The project scope no longer matches the active template. Please reload and try again.',
  TEMPLATE_NOT_CONFIGURED: 'This project has no resolvable scope template.',
  NOT_AUTHORIZED: 'You do not have permission to edit this project.',
  SCHEDULE_NOT_CONTRACTOR_MANAGED: 'This project\'s schedule is not contractor-managed.',
  SCHEDULE_PENDING_REVIEW: 'Scope cannot be edited while the schedule is pending review.',
  BASELINE_ALREADY_APPROVED: 'Scope cannot be edited once the schedule baseline has been approved.',
};

export function classifyScopeSyncError(error, operation, requestId) {
  const message = error?.message || '';
  const code = Object.keys(SAFE_MESSAGES).find(candidate => message.includes(candidate));
  if (!code) return null;
  return {
    code,
    message: SAFE_MESSAGES[code],
    operation,
    retryable: false,
    fieldErrors: {},
    requestId,
    cause: error,
  };
}
