/**
 * seed-test-users.mjs — Create/repair the 4 E2E test accounts.
 *
 * Run from weekly-tracker/:   node scripts/seed-test-users.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (sb_secret_) in .env.local — admin API
 * bypasses RLS and can create auth users. Never bundled to the browser.
 *
 * Idempotent: if a user already exists, its password is reset and its profile
 * is re-upserted. Safe to re-run. Passwords match tests/e2e/helpers.js fallbacks.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadDotEnv(path = '.env.local') {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf-8').split('\n')
        .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
        .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
    );
  } catch { return {}; }
}

const env         = loadDotEnv();
const URL         = process.env.VITE_SUPABASE_URL         || env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error('❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// role uses CAPITAL case — profiles.role is 'Admin'|'PM'|'Contractor'|'Viewer'
const USERS = [
  { email: 'admin@openday.fit', password: 'Admin', name: 'E2E Admin',     role: 'Admin' },
  { email: 'pm@openday.fit',    password: 'Pm',    name: 'E2E PM',         role: 'PM' },
  { email: 'gc@openday.fit',    password: 'Gc',    name: 'E2E Contractor', role: 'Contractor' },
  { email: 'viewer@construction.com', password: 'Viewer', name: 'E2E Viewer', role: 'Viewer' },
];

// Find an existing auth user by email (paginates listUsers).
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

// A stable, permanent project for gc@openday.fit to be assigned to. E2E specs
// routinely create/delete their own throwaway projects (23-e2e-seed, 22-persistent-
// demo-scenario, etc.), so "assign the contractor to whatever the first 2 rows
// happen to be" can land on 0 rows between runs — and an unassigned contractor
// makes can_write_project() reject every submit, silently failing any test that
// logs in as gc@openday.fit. Anchoring on a dedicated store_code this script owns
// (created once, reused after) guarantees the contractor always has ≥1 project.
const CONTRACTOR_ANCHOR_PROJECT = {
  store_code: 'E2E-CONTRACTOR-BASE',
  shopping_mall_name: 'E2E Contractor Anchor Mall',
  country: 'Testland',
  city: 'Testville',
  general_contractor: 'E2E Contractor',
  project_type: 'New Opening',
  project_status: 'Active',
};

async function ensureContractorAnchorProject() {
  const { data: existing, error: selErr } = await admin
    .from('projects').select('id').eq('store_code', CONTRACTOR_ANCHOR_PROJECT.store_code).limit(1);
  if (selErr) { console.error('❌  Could not check for anchor project:', selErr.message); return null; }
  if (existing?.length) return existing[0].id;

  const { data: created, error: insErr } = await admin
    .from('projects').insert([CONTRACTOR_ANCHOR_PROJECT]).select('id').single();
  if (insErr) { console.error('❌  Could not create anchor project:', insErr.message); return null; }
  console.log(`+  Created contractor anchor project ${CONTRACTOR_ANCHOR_PROJECT.store_code} (id=${created.id})`);
  return created.id;
}

async function main() {
  // Contractor gets assigned to the first 2 existing projects (plus the anchor
  // project above, guaranteed to exist) so the "contractor can access assigned
  // project" test has data to work with.
  const { data: projects, error: pErr } = await admin
    .from('projects').select('id').order('id', { ascending: true }).limit(2);
  if (pErr) { console.error('❌  Could not read projects:', pErr.message); process.exit(1); }

  const anchorId = await ensureContractorAnchorProject();
  const assignedProjects = [...new Set([anchorId, ...(projects || []).map(p => p.id)].filter(Boolean))].slice(0, 2);
  console.log(`ℹ  Contractor will be assigned to projects: ${JSON.stringify(assignedProjects)}\n`);

  for (const u of USERS) {
    let userId;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
    });

    if (cErr) {
      // Already exists → look up + reset password.
      const existing = await findUserByEmail(u.email);
      if (!existing) { console.error(`❌  ${u.email}: ${cErr.message}`); continue; }
      userId = existing.id;
      const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
        password: u.password, email_confirm: true,
      });
      // Password reset can legitimately fail independent of whether the account's
      // EXISTING password (set before the project's current min-length policy) still
      // works — e.g. the fallback 'Pm'/'Gc' passwords in helpers.js are shorter than
      // Supabase's current 6-char minimum. Don't let that skip the profile upsert
      // below: role/assigned_projects repair is the more important half of "repair".
      if (upErr) console.error(`⚠  ${u.email} password reset skipped: ${upErr.message}`);
      else        console.log(`↻  ${u.email.padEnd(26)} exists → password reset  (id=${userId})`);
    } else {
      userId = created.user.id;
      console.log(`+  ${u.email.padEnd(26)} created            (id=${userId})`);
    }

    // Upsert profile (id is PK / FK to auth.users).
    const profile = {
      id: userId,
      name: u.name,
      email: u.email,
      role: u.role,
      assigned_projects: u.role === 'Contractor' ? assignedProjects : [],
    };
    const { error: prErr } = await admin.from('profiles').upsert(profile, { onConflict: 'id' });
    if (prErr) console.error(`   ⚠  profile upsert failed: ${prErr.message}`);
    else       console.log(`   ✓  profile set  role=${u.role}  assigned=${JSON.stringify(profile.assigned_projects)}`);
  }

  console.log('\n✅  Test users ready. Re-run:  npm run test:e2e -- tests/e2e/20-role-security.spec.js tests/e2e/12-auth-roles.spec.js');
}

main().catch(err => { console.error('💥  Fatal:', err.message); process.exit(1); });
