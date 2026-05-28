// Auth service backed by Supabase Auth + profiles table.
// Swap only this file if you ever migrate to a different provider.

import { supabase } from '../lib/supabase';
import { PERMISSIONS } from './rolePermissions';

// Fetches the user's profile row from public.profiles
async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, role, company_id, assigned_projects')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[authService] fetchProfile error:', error.code, error.message);
    return null;
  }
  return data;
}

// Builds a safe session object from a Supabase user + profile row
function buildUser(supabaseUser, profile) {
  const role = profile?.role ?? 'Viewer';
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: profile?.name ?? supabaseUser.email,
    role,
    companyId: profile?.company_id ?? null,
    assignedProjects: profile?.assigned_projects ?? [],
    permissions: PERMISSIONS[role] ?? [],
  };
}

// Returns { success, user } | { success, error }
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { success: false, error: error.message };

  const profile = await fetchProfile(data.user.id);
  return { success: true, user: buildUser(data.user, profile) };
}

async function logout() {
  await supabase.auth.signOut();
}

// Restores session from Supabase's own storage on page load
async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[authService] getSession error:', error.message);
      return null;
    }
    if (!data?.session) return null;

    const profile = await fetchProfile(data.session.user.id);
    return buildUser(data.session.user, profile);
  } catch (err) {
    console.error('[authService] getSession exception:', err.message);
    return null;
  }
}

// Supabase exposes the raw client for onAuthStateChange in AuthContext
export { supabase as supabaseClient };

export const authService = { login, logout, getSession };
