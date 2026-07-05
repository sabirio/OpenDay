import { supabase } from '../lib/supabase';

export async function fetchActiveTemplate() {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, family_id, version, data')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (error) throw error;
    return { id: data.id, name: data.name, familyId: data.family_id, version: data.version, ...data.data };
  } catch (err) {
    console.error('fetchActiveTemplate:', err);
    return null;
  }
}

export async function fetchTemplateById(id) {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, family_id, version, data')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { id: data.id, name: data.name, familyId: data.family_id, version: data.version, ...data.data };
  } catch (err) {
    console.error('fetchTemplateById:', err);
    return null;
  }
}

export async function fetchAllTemplates() {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, family_id, version, data, is_active');
    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id, name: row.name, familyId: row.family_id, version: row.version,
      isActive: row.is_active, ...row.data,
    }));
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
      .select('id, family_id, version, is_active')
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

    const { data: newRow, error: insertErr } = await supabase
      .from('templates')
      .insert({ name: current.name ?? '', data, family_id: current.family_id, version: nextVersion, is_active: true })
      .select('id')
      .single();
    if (insertErr) throw insertErr;

    return { ok: true, id: newRow.id, versioned: true, version: nextVersion };
  } catch (err) {
    console.error('saveTemplate:', err);
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}
