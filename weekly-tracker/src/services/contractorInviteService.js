import { supabase } from '../lib/supabase';

/**
 * Idempotent — safe to call repeatedly for the same contractor across
 * multiple projects.
 */
export async function grantContractorAccess(email) {
  const { data, error } = await supabase.rpc('invite_contractor', {
    contractor_email: email,
  });
  return { data, error };
}

export async function sendContractorMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}/contractor-select`,
    },
  });
  return { error };
}
