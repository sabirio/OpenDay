import { getById } from '../../services/projectService';
import { checkConflict } from '../../services/conflictGuard';
import { grantContractorAccess, sendContractorMagicLink } from '../../services/contractorInviteService';

export async function getProjectById(projectId) {
  return getById(projectId);
}

export async function checkProjectConflict(projectId, clientUpdatedAt) {
  return checkConflict('projects', projectId, clientUpdatedAt);
}

/**
 * Grants portal access for a contractor email. Returns true only when the
 * grant genuinely succeeded — callers must not proceed to send the magic
 * link (or save the project's contractorEmail) on a false return.
 */
export async function grantContractorInviteAccess(email) {
  const { data, error } = await grantContractorAccess(email);
  return !error && !data?.error;
}

/**
 * Sends the sign-in magic link and classifies the outcome for the invite
 * UI's idle|sending|sent|access_granted|error status machine. A rate-limit
 * response still means access is already granted (step 1 succeeded), so it
 * is not treated the same as a hard error.
 */
export async function sendContractorInviteLink(email) {
  const { error } = await sendContractorMagicLink(email);
  if (!error) return 'sent';
  const isRateLimit = error.message?.toLowerCase().includes('rate') || error.status === 429;
  return isRateLimit ? 'access_granted' : 'error';
}
