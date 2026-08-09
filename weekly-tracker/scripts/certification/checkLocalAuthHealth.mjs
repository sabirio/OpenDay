// Local-only, non-destructive auth health check for the canonical cert.local
// fixture users. Does NOT reset or reseed anything — it only proves the
// canonical accounts can currently authenticate against the local Supabase
// Auth API. Safe to run at any time to sanity-check "is local login broken
// right now?" before reaching for `npm run cert:reset:local`.
//
// Targets only http://127.0.0.1:54321 (enforced by env.mjs's assertLocalTarget
// guard, same LOCAL_FIXTURE_MODE=1 / LOCAL_SUPABASE_PROJECT_ID=weekly-tracker
// contract every other certification script uses). Prints PASS/FAIL per
// account only — never an access token, refresh token, or any key.
//
// Run: node scripts/certification/checkLocalAuthHealth.mjs

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY } from './env.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';
import { requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const PASSWORD = getLocalFixturePassword();

// The three canonical local development accounts. Deliberately not the full
// 9-user fixtures.mjs roster — this check exists to answer "can I log in
// locally right now", not to re-certify the whole fixture set.
const CANONICAL_ACCOUNTS = [
  { role: 'Admin', email: 'admin-a@cert.local' },
  { role: 'PM', email: 'pm-a-assigned@cert.local' },
  { role: 'Contractor', email: 'contractor-a-assigned@cert.local' },
];

async function checkLogin(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user?.id) return false;
  await client.auth.signOut();
  return true;
}

async function main() {
  console.log(`Local auth health check — target: ${SUPABASE_URL} (loopback-only, enforced by env.mjs)\n`);
  let allPass = true;
  for (const { role, email } of CANONICAL_ACCOUNTS) {
    const ok = await checkLogin(email);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${role.padEnd(12)} ${email}`);
    if (!ok) allPass = false;
  }
  console.log(
    allPass
      ? '\nLOCAL AUTH HEALTH: PASS — all canonical accounts authenticate.'
      : '\nLOCAL AUTH HEALTH: FAIL — at least one canonical account could not authenticate.\nFix: from weekly-tracker/, run `npm run cert:reset:local` to reseed the canonical fixtures.'
  );
  process.exit(allPass ? 0 : 1);
}

main();
