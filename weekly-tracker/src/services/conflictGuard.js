import { supabase } from '../lib/supabase';

/**
 * Checks whether a record was modified on the server since the client loaded
 * it (last-write-wins with warning, not full OT/CRDT).
 *
 * @param {string} tableName
 * @param {string|number} recordId
 * @param {string|null} clientUpdatedAt - updated_at value the client loaded the record with
 * @returns {Promise<{conflict: boolean, serverUpdatedAt?: string}>}
 */
export async function checkConflict(tableName, recordId, clientUpdatedAt) {
  if (!clientUpdatedAt) return { conflict: false };

  const { data, error } = await supabase
    .from(tableName)
    .select('updated_at')
    .eq('id', recordId)
    .single();

  if (error || !data?.updated_at) return { conflict: false };

  const serverTs = new Date(data.updated_at).getTime();
  const clientTs = new Date(clientUpdatedAt).getTime();

  if (serverTs > clientTs) {
    return { conflict: true, serverUpdatedAt: data.updated_at };
  }
  return { conflict: false };
}
