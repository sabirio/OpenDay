import { supabase } from '../lib/supabase';
import {
  fetchActiveLegacyTemplateRecord,
  fetchAllTemplateRecords,
  fetchTemplateRecordById,
  getTemplateLoadErrorMessage,
} from '../services/templateService.js';

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

export async function fetchActiveTemplateResult() {
  try {
    return { template: flattenTemplateRecord(await fetchActiveLegacyTemplateRecord()), error: null, message: null };
  } catch (error) {
    console.error('fetchActiveTemplate:', error);
    return { template: null, error, message: getTemplateLoadErrorMessage(error) };
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

export async function fetchAllTemplates() {
  try {
    return (await fetchAllTemplateRecords()).map(flattenTemplateRecord);
  } catch (err) {
    console.error('fetchAllTemplates:', err);
    return [];
  }
}

export async function saveTemplate(id, data) {
  try {
    // a) Load the current row.
    const { data: current, error: loadErr } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();
    if (loadErr) throw loadErr;

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

    // Deactivate current active BEFORE inserting the new one (partial-unique index).
    const { error: deactivateErr } = await supabase
      .from('templates')
      .update({ is_active: false })
      .eq('family_id', current.family_id)
      .eq('is_active', true);
    if (deactivateErr) throw deactivateErr;

    const versionedRow = {
      name: current.name ?? '',
      data,
      family_id: current.family_id,
      version: nextVersion,
      is_active: true,
    };
    if (Object.hasOwn(current, 'family')) versionedRow.family = current.family;
    if (Object.hasOwn(current, 'company_id')) versionedRow.company_id = current.company_id;

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
