/**
 * importWorkflowIO — the only two Import Phase 3 functions that touch
 * services/Supabase. Split out from importWorkflowModel.js (which stays
 * 100% pure and unit-testable under plain Node) purely so that a top-level
 * `import '../../services/importCommitService.js'` — which itself imports
 * lib/supabase.js, which reads Vite's `import.meta.env` at module-load time
 * — doesn't poison every pure function in the same file. Both files are
 * core/ layer; the hook imports from both (core -> services is the
 * permitted direction — see architectureGuard.test.mjs's HARD guard).
 */
import { fetchExistingStoreCodes, commitProjectImportBatch } from '../../services/importCommitService.js';

/** Company-scoped existing identities for planProjectImport's `existingProjects` input. */
export async function fetchExistingProjectIdentities(companyId) {
  return fetchExistingStoreCodes(companyId);
}

/** Byte-identical plan.rows submitted to the trusted RPC — never converted. */
export async function commitPlan({ companyId, planRows, clientRequestId, sourceFilename, mappingSnapshot }) {
  return commitProjectImportBatch({ companyId, planRows, clientRequestId, sourceFilename, mappingSnapshot });
}
