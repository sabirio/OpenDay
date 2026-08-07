import { supabase } from '../lib/supabase';
import { selectDefaultScopeTemplate } from '../domains/construction/templates/versionedScopeTemplate.js';
import {
  TEMPLATE_SELECT,
  toTemplateRecord,
  isTemplateSchemaContractError,
} from './templateRecordContract.js';

export {
  TEMPLATE_SELECT,
  toTemplateRecord,
  isTemplateSchemaContractError,
  TemplateDataContractError,
} from './templateRecordContract.js';

// Thrown when template-family routing genuinely cannot be resolved safely -
// never thrown as a substitute for "just pick something." Two real causes:
//   - AMBIGUOUS_ACTIVE_TEMPLATES: more than one active candidate exists and
//     there is no family/company_id information to disambiguate them (the
//     production baseline schema allows this - see the header comment on
//     resolveLegacyGlobalDefaultTemplateId below).
//   - NO_APPLICABLE_TEMPLATE: family-based routing (V2) found zero active
//     candidates for the requested family - this includes the case where
//     `family` does not exist as a column at all (every row normalizes to
//     family: null, so nothing can ever match a non-null requested family).
export class TemplateConfigurationUnavailableError extends Error {
  constructor(message, { reason } = {}) {
    super(message);
    this.name = 'TemplateConfigurationUnavailableError';
    this.code = 'TEMPLATE_CONFIGURATION_UNAVAILABLE';
    this.reason = reason;
  }
}

export async function getCurrentCompanyId() {
  const { data, error } = await supabase.rpc('current_company_id');
  if (error) throw error;
  return data ?? null;
}

// V2 family-routed candidates. Never filters on `family` at the database
// level (see templateRecordContract.js header) - fetches every active row
// and filters on the normalized record in application code instead.
export async function fetchApplicableTemplateRecords(family) {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .eq('is_active', true)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTemplateRecord).filter(record => record.family === family);
}

export async function resolveDefaultScopeTemplateForCurrentCompany(family) {
  const [companyId, records] = await Promise.all([
    getCurrentCompanyId(),
    fetchApplicableTemplateRecords(family),
  ]);
  const resolved = selectDefaultScopeTemplate(records, { family, companyId });
  if (!resolved) {
    throw new TemplateConfigurationUnavailableError(
      `No applicable active "${family}" scope template is configured for this company or globally.`,
      { reason: 'NO_APPLICABLE_TEMPLATE' }
    );
  }
  return resolved;
}

// Legacy (pre-family, family IS NULL) global default template lookup -
// schema-compatible with the production baseline (no `family` column at
// all) and with the post-041 schema (an explicit `family IS NULL` row)
// alike. Never assumes exactly one active row exists: the baseline schema's
// own uniqueness constraint (`templates_one_active_per_family` on
// `family_id`) only prevents two active versions of the SAME family_id
// lineage - it does nothing to prevent two different family_id lineages
// from both being active at once. Zero candidates is a legitimate, existing
// "no legacy default configured" state (preserves the exact pre-existing
// behavior of a project being created with template_id = null). More than
// one candidate is genuine ambiguity with no data to break the tie - it is
// surfaced as TemplateConfigurationUnavailableError, never resolved by
// picking the first/newest/arbitrary row.
async function fetchLegacyGlobalDefaultCandidates() {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .eq('is_active', true)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTemplateRecord).filter(record => record.family == null);
}

function resolveSingleLegacyCandidate(candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new TemplateConfigurationUnavailableError(
      `${candidates.length} active legacy (family-less) templates are configured; template routing cannot be resolved unambiguously.`,
      { reason: 'AMBIGUOUS_ACTIVE_TEMPLATES' }
    );
  }
  return candidates[0];
}

export async function resolveLegacyGlobalDefaultTemplateId() {
  const record = resolveSingleLegacyCandidate(await fetchLegacyGlobalDefaultCandidates());
  return record ? record.id : null;
}

export async function resolveLegacyGlobalDefaultTemplateRecord() {
  return resolveSingleLegacyCandidate(await fetchLegacyGlobalDefaultCandidates());
}

export async function fetchTemplateRecordsByIds(ids) {
  const uniqueIds = [...new Set((ids ?? []).filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .in('id', uniqueIds);
  if (error) throw error;
  return new Map((data ?? []).map(row => {
    const record = toTemplateRecord(row);
    return [record.id, record];
  }));
}

// Optional-hydration boundary for fetchTemplateRecordsByIds. Semantics
// (see the P0 task's Phase 5 spec, reproduced exactly):
//   A. The caller's own primary query (e.g. `projects`) failing is NOT this
//      function's concern - callers must fail their own load themselves;
//      this function only ever wraps the OPTIONAL template-hydration call.
//   B. Any error that is not the exact, known templates.family/company_id
//      schema-contract mismatch (auth/RLS/permission/network/table-missing/
//      malformed-row/anything else) is RE-THROWN, never swallowed.
//   C. The exact known schema-contract mismatch degrades to an empty Map -
//      callers proceed without scopeTemplate metadata rather than failing.
export async function settleOptionalTemplateRecords(ids, fetcher = fetchTemplateRecordsByIds) {
  try {
    return { templatesById: await fetcher(ids), error: null };
  } catch (error) {
    if (!isTemplateSchemaContractError(error)) throw error;
    return { templatesById: new Map(), error };
  }
}

export async function fetchOptionalTemplateRecordsByIds(ids, fetcher = fetchTemplateRecordsByIds) {
  const result = await settleOptionalTemplateRecords(ids, fetcher);
  if (result.error) {
    console.warn('[templates] Optional template hydration degraded (schema rollout in progress):', result.error);
  }
  return result;
}

export async function fetchTemplateRecordById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toTemplateRecord(data) : null;
}

export async function settleOptionalTemplateRecord(id, fetcher = fetchTemplateRecordById) {
  try {
    return { template: await fetcher(id), error: null };
  } catch (error) {
    if (!isTemplateSchemaContractError(error)) throw error;
    return { template: null, error };
  }
}

export async function fetchOptionalTemplateRecordById(id, fetcher = fetchTemplateRecordById) {
  const result = await settleOptionalTemplateRecord(id, fetcher);
  if (result.error) {
    console.warn('[templates] Optional template hydration degraded (schema rollout in progress):', result.error);
  }
  return result;
}

export async function fetchAllTemplateRecords() {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_SELECT);
  if (error) throw error;
  return (data ?? []).map(toTemplateRecord);
}

// Distinguishes a confirmed-empty result from an unavailable one (P0 Phase
// 8). `status: 'available'` with `templates: []` means the query genuinely
// ran and returned zero rows. `status: 'unavailable'` means the query could
// not run at all because of the known schema-contract mismatch - it is
// never conflated with "there are zero templates." Any other failure
// (auth/RLS/network/anything else) is re-thrown, not represented as either
// state.
export async function fetchAllTemplatesResult() {
  try {
    const templates = await fetchAllTemplateRecords();
    return { status: 'available', templates, error: null };
  } catch (error) {
    if (!isTemplateSchemaContractError(error)) throw error;
    return { status: 'unavailable', templates: [], error };
  }
}
