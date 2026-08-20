// Auth service backed by Supabase Auth + profiles table.
// Swap only this file if you ever migrate to a different provider.

import { supabase } from '../lib/supabase';
import { PERMISSIONS } from './rolePermissions';
import { userSafeError } from '../utils/userError';

// Fetches the user's profile row from public.profiles
async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, role, job_role, company_id, assigned_projects')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[authService] fetchProfile error:', error.code, error.message);
    return null;
  }
  return data;
}

async function fetchOrganizationContext() {
  const { data, error } = await supabase.rpc('get_my_organization_context');
  if (error) {
    console.error('[authService] fetchOrganizationContext error:', error.code, error.message);
    return { platformSuperadmin: false, organizations: [] };
  }
  const context = data ?? { platformSuperadmin: false, organizations: [] };
  const organizations = await Promise.all((context.organizations ?? []).map(async organization => {
    const { data: entitlementData, error: entitlementError } = await supabase.rpc(
      'get_effective_organization_entitlements',
      { p_organization_id: organization.organizationId },
    );
    if (entitlementError) {
      console.error('[authService] fetchEffectiveEntitlements error:', entitlementError.code, entitlementError.message);
      return { ...organization, effectiveCapabilities: [], entitlementStatus: 'error' };
    }
    return {
      ...organization,
      effectiveCapabilities: (entitlementData?.capabilities ?? [])
        .filter(capability => capability.enabled === true)
        .map(capability => capability.capabilityId),
      entitlementStatus: 'ready',
    };
  }));
  return { ...context, organizations };
}

async function activateOrganizationInvitations() {
  const { error } = await supabase.rpc('activate_my_organization_invitations');
  if (error && error.code !== 'PGRST202') {
    console.error('[authService] activateOrganizationInvitations error:', error.code, error.message);
  }
}

// Builds a safe session object from a Supabase user + profile row
function buildUser(supabaseUser, profile, organizationContext) {
  const role = profile?.role ?? 'Executive';
  const organizations = organizationContext?.organizations ?? [];
  const permissions = [...(PERMISSIONS[role] ?? [])];
  if (organizations.some(item => item.organizationRole === 'ORG_ADMIN')
    && !permissions.includes('all') && !permissions.includes('admin_users')) {
    permissions.push('admin_users');
  }
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: profile?.name ?? supabaseUser.email,
    role,
    jobRole: profile?.job_role ?? null,
    companyId: profile?.company_id ?? null,
    assignedProjects: profile?.assigned_projects ?? [],
    permissions,
    platformSuperadmin: organizationContext?.platformSuperadmin === true,
    organizations,
  };
}

// Returns { success, user } | { success, error }
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[authService] login error:', error);
    return { success: false, error: userSafeError('auth') };
  }

  await activateOrganizationInvitations();

  const [profile, organizationContext] = await Promise.all([
    fetchProfile(data.user.id),fetchOrganizationContext(),
  ]);
  return { success: true, user: buildUser(data.user, profile, organizationContext) };
}

async function logout() {
  await supabase.auth.signOut();
}

// Sends a password-reset email. Always returns { success: true } — never reveals
// whether the email is registered (prevents user-enumeration attacks).
async function requestPasswordReset(email) {
  const redirectTo = typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password`
    : '/reset-password';
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch (_) {
    // intentionally suppressed — see comment above
  }
  return { success: true };
}

// Updates the authenticated user's password (called from /reset-password page after
// the PASSWORD_RECOVERY session is established via the email link).
async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[authService] updatePassword error:', error);
    return { success: false, error: userSafeError('password') };
  }
  return { success: true };
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

    await activateOrganizationInvitations();

    const [profile, organizationContext] = await Promise.all([
      fetchProfile(data.session.user.id),fetchOrganizationContext(),
    ]);
    return buildUser(data.session.user, profile, organizationContext);
  } catch (err) {
    console.error('[authService] getSession exception:', err.message);
    return null;
  }
}

// Supabase exposes the raw client for onAuthStateChange in AuthContext
export { supabase as supabaseClient };

export const authService = { login, logout, getSession, requestPasswordReset, updatePassword };
