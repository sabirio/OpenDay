// Destructive local-only regression: reset -> fixture login -> reset -> login again.
// Uses only CERT_* process variables guarded by env.mjs; never reads .env.local.

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { SUPABASE_URL, ANON_KEY } from './env.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const weeklyTrackerDir = path.resolve(__dirname, '..', '..');
const password = getLocalFixturePassword();
const users = ['pm-a-assigned@cert.local', 'admin-a@cert.local'];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runNodeScript(relativePath) {
  execFileSync(process.execPath, [relativePath], {
    cwd: weeklyTrackerDir,
    stdio: 'inherit',
    env: process.env,
  });
}

async function assertLogin(email) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user?.id) throw new Error(`fixture login failed for ${email}`);
  await client.auth.signOut();
}

async function cycle(index) {
  console.log(`\nFixture password persistence cycle ${index}/2: local reset + reseed`);
  if (index > 1) await delay(5000);
  runNodeScript('scripts/certification/resetAndDeploy.mjs');
  runNodeScript('scripts/certification/fixtures.mjs');

  for (const email of users) {
    await assertLogin(email);
    console.log(`  login OK: ${email}`);
  }
}

await cycle(1);
await cycle(2);
console.log('\nFixture password persistence PASS: two reset/login cycles succeeded.');
