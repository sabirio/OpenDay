// Pure, network-free helpers for the atomic Create Project command
// (createContractorManagedProjectCommand.js). Split out from that module so
// this logic is unit-testable under plain Node — the command module itself
// statically imports services/projectService.js, which imports lib/supabase.js
// (needs import.meta.env / a real Vite runtime), so it can never be loaded by
// this repo's plain-node *.test.mjs runner. See
// scripts/certification/certifyCreateContractorManagedProject.mjs for the
// RPC-calling behavior's actual (DB-backed) certification.
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveProjectScopeSelection } from './scope/getScopeWPIds.js';

/**
 * The RPC requires a non-empty explicit WP id array — unlike the Gantt
 * engines, it has no "null = every WP in the template" convenience. This
 * resolves the exact same selection resolveProjectScopeSelection() already
 * defines (null/absent scope = every active WP in the resolved template),
 * just materialized into an explicit list here since the RPC boundary
 * requires one. No new Scope selection rule is introduced.
 */
export function resolveActiveScopeWPIds(project) {
  const template = resolveProjectScopeTemplate(project);
  const workPackages = template?.workPackages || [];
  const selected = resolveProjectScopeSelection({
    scope: project.scope,
    workPackages,
    schemaVersion: template?.data?.schemaVersion,
  });
  return selected ?? workPackages.map(wp => wp.id);
}

// create_contractor_managed_project()'s own canonical error vocabulary
// (052_create_contractor_managed_project.sql) — distinct from the generic
// write-command codes normalizeWriteError() already covers (auth/network/
// conflict). Matched by substring against the raised message, same technique
// normalizeWriteError() itself uses for DUPLICATE_WORK_PACKAGE.
const SAFE_MESSAGES = {
  EMPTY_SCOPE: 'Select at least one work package before creating the project.',
  STORE_CODE_REQUIRED: 'Store code is required.',
  INVALID_WORK_PACKAGE: 'The project scope is invalid. Please reload and try again.',
  DUPLICATE_WORK_PACKAGE: 'The project scope contains a duplicate work package. Please reload and try again.',
  WORK_PACKAGE_OUT_OF_TEMPLATE: 'The project scope no longer matches the active template. Please reload and try again.',
  PROJECT_CODE_CONFLICT: 'A project with this store code already exists.',
  TEMPLATE_NOT_CONFIGURED: 'No active scope template is configured for this company.',
  NOT_AUTHORIZED: 'You do not have permission to create a project for this company.',
};

export function classifyCreateError(error, operation, requestId) {
  const message = error?.message || '';
  const code = Object.keys(SAFE_MESSAGES).find(candidate => message.includes(candidate));
  if (!code) return null;
  return {
    code,
    message: SAFE_MESSAGES[code],
    operation,
    retryable: code === 'PROJECT_CODE_CONFLICT',
    fieldErrors: {},
    requestId,
    cause: error,
  };
}
