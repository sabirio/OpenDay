import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { assertLocalTarget } from './localTargetGuard.mjs';

const target = assertLocalTarget({
  apiUrl: process.env.VITE_SUPABASE_URL,
  dbUrl: process.env.CERT_DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('REFUSING E2E: process-scoped local service key is required for fixture preflight.');

const admin = createClient(target.apiUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const requiredEmails = ['admin@openday.fit', 'pm@openday.fit', 'gc@openday.fit', 'viewer@construction.com'];
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) throw error;
if (!requiredEmails.every(email => data.users.some(user => user.email === email))) throw new Error('REFUSING E2E: required local Auth fixtures are missing.');

const sql = "SELECT (SELECT count(*) FROM public.projects WHERE id=910001)=1 AND (SELECT count(*) FROM public.profiles WHERE email IN ('admin@openday.fit','pm@openday.fit','gc@openday.fit','viewer@construction.com'))=4;";
const result = execFileSync('psql', [target.dbUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
  encoding: 'utf8',
  env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` },
}).trim();
if (result !== 't') throw new Error('REFUSING E2E: deterministic local database fixtures are missing.');
console.log(`Local E2E preflight PASS: ${new URL(target.apiUrl).host}; project=weekly-tracker`);
