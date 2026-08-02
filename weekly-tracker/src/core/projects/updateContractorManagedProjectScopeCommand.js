import { updateContractorManagedProjectScope as callUpdateScopeRpc } from '../../services/projectService.js';
import { normalizeWriteError } from '../write/writeCommand.js';
import { resolveActiveScopeWPIds, classifyScopeSyncError } from './updateContractorManagedProjectScopeSupport.js';

/**
 * Orchestrates one atomic Contractor-Managed Scope-edit attempt. Resolves
 * the new active Scope WP ids, calls the RPC wrapper once, and normalizes
 * any failure into the same safe application-error shape every other write
 * command uses — this command's own error vocabulary (including the
 * lifecycle-lock codes) is classified first, falling back to the shared
 * generic classifier for auth/network/conflict. Never falls back to a plain
 * projectService.update() Scope write — a failure here must surface to the
 * caller as a failure, not a silent, unsynchronized partial edit.
 *
 * @param {object} project — the project's current state, with `scope`
 *   already set to the NEW desired value and templateId/scopeTemplate
 *   still the project's existing (immutable) pinned template.
 * @param {string} clientRequestId — uuid; the caller owns generating/retaining
 *   this across retries of the same logical Scope-edit attempt.
 */
export async function updateContractorManagedProjectScopeCommand(project, clientRequestId) {
  const operation = 'project.update_contractor_managed_scope';
  const scopeWpIds = resolveActiveScopeWPIds(project);
  try {
    return await callUpdateScopeRpc(project.id, project.scope, scopeWpIds, clientRequestId);
  } catch (error) {
    throw classifyScopeSyncError(error, operation, clientRequestId) || normalizeWriteError(error, operation, clientRequestId);
  }
}
