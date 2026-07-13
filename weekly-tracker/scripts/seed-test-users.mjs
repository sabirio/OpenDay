import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './certification/localTargetGuard.mjs';

const API_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.CERT_DB_URL;

if (!API_URL || !SERVICE_KEY || !DB_URL) throw new Error('Local API, service key, and database URL must be process-scoped.');
const target = assertLocalTarget({
  apiUrl: API_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});
console.log(`Local fixture target verified: ${new URL(target.apiUrl).host}; project=weekly-tracker`);

const admin = createClient(target.apiUrl, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const users = [
  { key: 'admin_id', email: 'admin@openday.fit', password: 'Admin123!' },
  { key: 'pm_id', email: 'pm@openday.fit', password: 'Pm123!' },
  { key: 'contractor_id', email: 'gc@openday.fit', password: 'Gc123!' },
  { key: 'viewer_id', email: 'viewer@construction.com', password: 'Viewer' },
];

async function findUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === email);
    if (found || data.users.length < 200) return found;
  }
}

async function main() {
  const ids = {};
  for (const fixture of users) {
    const existing = await findUser(fixture.email);
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password: fixture.password, email_confirm: true });
      if (error) throw error;
      ids[fixture.key] = existing.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: fixture.email, password: fixture.password, email_confirm: true });
      if (error) throw error;
      ids[fixture.key] = data.user.id;
    }
  }

  const sql = fileURLToPath(new URL('./certification/seed-test-data.sql', import.meta.url));
  const args = [target.dbUrl, '-v', 'ON_ERROR_STOP=1'];
  for (const [key, value] of Object.entries(ids)) args.push('-v', `${key}=${value}`);
  args.push('-f', sql);
  execFileSync('psql', args, {
    stdio: 'inherit',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
  });
  console.log('Local Auth and deterministic public fixtures are ready.');
}

main().catch(error => { console.error(`Local fixture seed failed: ${error.message}`); process.exit(1); });
