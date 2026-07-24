// importCommitService.js — Import Foundation v1 Phase 2's only write path for
// historical project import. Calls the trusted commit_project_import_batch
// RPC (migration 038); never inserts into public.projects directly, and
// never loops client-side .insert() calls (that RPC is a real, atomic-
// per-row, server-verified batch commit — see the migration's own header).
//
// Preview and Commit share the exact same plan: this function takes the
// `rows` array produced by core/import/planProjectImport.js verbatim (each
// {sourceRow, action, normalized, errors, warnings}) and submits it as-is —
// it never re-derives or overrides a row's CREATE/SKIP/BLOCK action.
import { supabase } from '../lib/supabase.js';

function safeError(error) {
  const message = error?.message || '';
  const code = /AUTHENTICATION_REQUIRED/.test(message) ? 'AUTHENTICATION_REQUIRED'
    : /IMPORT_FORBIDDEN/.test(message) || error?.code === '42501' ? 'FORBIDDEN'
    : /IDEMPOTENCY_CONFLICT/.test(message) || error?.code === '23505' ? 'IDEMPOTENCY_CONFLICT'
    : /MALFORMED_PLAN|INVALID_REQUEST/.test(message) || error?.code === '22023' ? 'INVALID_PAYLOAD'
    : /network|fetch|timeout/i.test(message) ? 'NETWORK_ERROR'
    : 'UNKNOWN_ERROR';
  return Object.assign(new Error(code), { code, diagnosticCode: error?.code || code, retryable: code === 'NETWORK_ERROR' });
}

/**
 * @param {object} input
 * @param {string} input.companyId - the single company this batch imports into (frozen design: one company per import)
 * @param {Array<{sourceRow:number, action:'CREATE'|'SKIP'|'BLOCK', normalized:object, errors:Array, warnings:Array}>} input.planRows - planProjectImport(...).rows, verbatim
 * @param {string} input.clientRequestId - caller-generated UUID; resubmitting the same id replays the original result rather than re-committing
 * @param {string} [input.sourceFilename]
 * @param {object} [input.mappingSnapshot] - the confirmed header->canonical-field mapping used to produce planRows, kept for audit only
 * @returns {Promise<{importJobId:number, summary:object, rows:Array, idempotentReplay:boolean}>}
 */
export async function commitProjectImportBatch({ companyId, planRows, clientRequestId, sourceFilename = null, mappingSnapshot = null }) {
  const { data, error } = await supabase.rpc('commit_project_import_batch', {
    p_company_id: companyId,
    p_rows: planRows || [],
    p_client_request_id: clientRequestId,
    p_source_filename: sourceFilename,
    p_mapping_snapshot: mappingSnapshot,
  });
  if (error) throw safeError(error);
  return data;
}
