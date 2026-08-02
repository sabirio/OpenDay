import { createContractorManagedProject as callCreateRpc } from '../../services/projectService.js';
import { normalizeWriteError } from '../write/writeCommand.js';
import { resolveActiveScopeWPIds, classifyCreateError } from './createContractorManagedProjectSupport.js';

/**
 * Orchestrates one atomic Contractor-Managed project creation attempt.
 * Resolves the active Scope WP ids, calls the RPC wrapper once, and
 * normalizes any failure into the same safe application-error shape every
 * other write command uses (core/write/writeCommand.js's normalizeWriteError
 * return shape) — this command's own error vocabulary is classified first
 * (see createContractorManagedProjectSupport.js), falling back to the shared
 * generic classifier for auth/network/conflict. Never falls back to
 * projectService.create() — a failure here must surface to the caller as a
 * failure, not a silent AUTO_GENERATED fallback.
 *
 * @param {object} project — new-project form state (no `id`)
 * @param {string} clientRequestId — uuid; the caller owns generating/retaining
 *   this across retries of the same logical create attempt (see
 *   core/write/writeCommand.js's createClientRequestId()).
 */
export async function createContractorManagedProjectCommand(project, clientRequestId) {
  const operation = 'project.create_contractor_managed';
  const scopeWpIds = resolveActiveScopeWPIds(project);
  try {
    return await callCreateRpc(project, scopeWpIds, clientRequestId);
  } catch (error) {
    throw classifyCreateError(error, operation, clientRequestId) || normalizeWriteError(error, operation, clientRequestId);
  }
}
