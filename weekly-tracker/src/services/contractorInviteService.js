import { supabase } from '../lib/supabase';

/**
 * All Contractor-role accounts visible to the caller, with their
 * assigned_projects — the same public.profiles columns and RLS boundary
 * (profiles_select: id = auth.uid() OR can_admin_company(company_id))
 * AdminUsers.jsx already reads for its own user-management table. This is
 * the canonical contractor identity/assignment source; no separate
 * contractor registry exists or is created here.
 */
export async function listContractors() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, assigned_projects')
    .eq('role', 'Contractor')
    .order('name');
  if (error) throw error;
  return data.map(row => ({
    id: row.id,
    name: row.name || row.email,
    email: row.email,
    assignedProjects: row.assigned_projects ?? [],
  }));
}

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
