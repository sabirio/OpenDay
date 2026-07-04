/**
 * seed-test-users.mjs — Create/repair the 3 E2E test accounts.
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

async function main() {
  // Contractor gets assigned to the first 2 existing projects so the
  // "contractor can access assigned project" test has data to work with.
  const { data: projects, error: pErr } = await admin
    .from('projects').select('id').order('id', { ascending: true }).limit(2);
  if (pErr) { console.error('❌  Could not read projects:', pErr.message); process.exit(1); }
  const assignedProjects = (projects || []).map(p => p.id);
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
      if (upErr) { console.error(`❌  ${u.email} password reset: ${upErr.message}`); continue; }
      console.log(`↻  ${u.email.padEnd(26)} exists → password reset  (id=${userId})`);
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
