import { supabase } from '../lib/supabase';
import {
  TEMPLATE_SELECT,
  toTemplateRecord,
  resolveLegacyGlobalDefaultTemplateRecord,
  fetchTemplateRecordById,
  fetchAllTemplatesResult,
} from '../services/templateService.js';

// Flattens a normalized TemplateRecord into the legacy shape every current
// consumer of this module (TemplateEditor.jsx, App.jsx) already expects:
// top-level id/name/family/familyId/companyId/version/isActive, plus every
// key from `data` spread on top. Only ever called with an already-validated
// TemplateRecord (never a raw DB row) - the DB-shape/malformed-data
// boundary is templateRecordContract.js's toTemplateRecord, not this
// function.
function flattenTemplateRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    family: record.family,
    familyId: record.familyId,
    companyId: record.companyId,
    version: record.version,
    isActive: record.isActive,
    ...record.data,
  };
}

// Result-shaped variant: never conflates "no active legacy template
// configured" (a real, valid state) with "the query failed" - see
// templateService.js's TemplateConfigurationUnavailableError and
// isTemplateSchemaContractError. getTemplateLoadErrorMessage-style
// consumers can use `error`/`message` for user-facing text; `template` is
// the flattened record or null.
export async function fetchActiveTemplateResult() {
  try {
    const record = await resolveLegacyGlobalDefaultTemplateRecord();
    return { template: flattenTemplateRecord(record), error: null };
  } catch (error) {
    console.error('fetchActiveTemplate:', error);
    return { template: null, error };
  }
}

export async function fetchActiveTemplate() {
  return (await fetchActiveTemplateResult()).template;
}

export async function fetchTemplateById(id) {
  try {
    return flattenTemplateRecord(await fetchTemplateRecordById(id));
  } catch (err) {
    console.error('fetchTemplateById:', err);
    return null;
  }
}

// Result-shaped variant distinguishing a confirmed-empty catalog from an
// unavailable one (P0 Phase 8) - see templateService.fetchAllTemplatesResult.
export async function fetchAllTemplatesResultFlattened() {
  const result = await fetchAllTemplatesResult();
  return { ...result, templates: result.templates.map(flattenTemplateRecord) };
}

export async function fetchAllTemplates() {
  return (await fetchAllTemplatesResultFlattened()).templates;
}

export async function saveTemplate(id, data) {
  try {
    // a) Load the current row. select('*') so this never fails on the
    // rollout-optional family/company_id columns - see
    // templateRecordContract.js. The RAW row (not the normalized record) is
    // kept alongside the normalized one specifically so the insert step
    // below can tell "this column is absent from the schema" apart from
    // "this column exists and is null" (toTemplateRecord collapses that
    // distinction on purpose, since every other consumer of a TemplateRecord
    // should not care - only a write path that must decide which columns to
    // name in an INSERT needs to know the difference).
    const { data: rawCurrent, error: loadErr } = await supabase
      .from('templates')
      .select(TEMPLATE_SELECT)
      .eq('id', id)
      .single();
    if (loadErr) throw loadErr;
    const current = toTemplateRecord(rawCurrent);

    // b) Check if any project references this template.
    const { data: refs, error: refErr } = await supabase
      .from('projects')
      .select('id')
      .eq('template_id', id)
      .limit(1);
    if (refErr) throw refErr;

    if (!refs || refs.length === 0) {
      // c) Not yet referenced — update in place.
      const { error: updateErr } = await supabase
        .from('templates')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateErr) throw updateErr;
      return { ok: true, id, versioned: false };
    }

    // d) Referenced — freeze old, create new version (copy-on-write).
    const nextVersion = current.version + 1;

    // Deactivate current active BEFORE inserting the new one (partial-unique
    // index). `family_id` is safe to name unconditionally - it has existed,
    // NOT NULL with no default, since 000_baseline.sql; it is never one of
    // the two rollout-optional columns.
    const { error: deactivateErr } = await supabase
      .from('templates')
      .update({ is_active: false })
      .eq('family_id', current.familyId)
      .eq('is_active', true);
    if (deactivateErr) throw deactivateErr;

    // Only name family/company_id in the INSERT if the current row's schema
    // actually has them (Object.hasOwn on the RAW row, not the normalized
    // one - see the comment above). Naming an absent column in an INSERT
    // fails exactly the same way naming it in a SELECT/filter does.
    // family_id is always included: NOT NULL, no default, always present.
    const versionedRow = {
      name: current.name ?? '',
      data,
      family_id: current.familyId,
      version: nextVersion,
      is_active: true,
    };
    if (Object.hasOwn(rawCurrent, 'family')) versionedRow.family = current.family;
    if (Object.hasOwn(rawCurrent, 'company_id')) versionedRow.company_id = current.companyId;

    const { data: newRow, error: insertErr } = await supabase
      .from('templates')
      .insert(versionedRow)
      .select('id')
      .single();
    if (insertErr) throw insertErr;

    return { ok: true, id: newRow.id, versioned: true, version: nextVersion };
  } catch (err) {
    console.error('saveTemplate:', err);
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}
