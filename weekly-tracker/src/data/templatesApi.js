import { supabase } from '../lib/supabase';

export async function fetchActiveTemplate() {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, data')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (error) throw error;
    return { id: data.id, name: data.name, ...data.data };
  } catch (err) {
    console.error('fetchActiveTemplate:', err);
    return null;
  }
}

export async function saveTemplate(id, data) {
  try {
    const { error } = await supabase
      .from('templates')
      .update({ data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('saveTemplate:', err);
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}
