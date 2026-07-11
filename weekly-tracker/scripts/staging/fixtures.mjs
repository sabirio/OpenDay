// Staging cloud certification — fixture setup, mirroring
// scripts/certification/fixtures.mjs's design (2 companies, 9 users, 3
// projects, Gantt scope, one pre-existing contractor report/site
// visit/progress-history row) but targeting the staging Supabase project
// instead of local Docker, since staging has no direct psql/DB_URL
// access — SQL seeding goes through `supabase db query --linked -f
// <tempfile>` (the same authenticated channel used to apply migrations),
// and `.env.staging` is the only source of configuration (never
// `.env.local`).
//
// Requires .env.staging sourced into the shell (STAGING_PROJECT_REF,
// VITE_SUPABASE_URL, and — the one this script actually needs beyond
// what the guard checks — STAGING_SUPABASE_SERVICE_ROLE_KEY) plus a
// PASSING run of scripts/staging/assertStagingTarget.mjs first.
//
// Run: node scripts/staging/fixtures.mjs

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..', '..');
const STATE_PATH = path.join(__dirname, 'staging-fixture-state.json');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = process.env.STAGING_PROJECT_REF;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PROJECT_REF || !PASSWORD) {
  console.error('REFUSING TO RUN: requires VITE_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, STAGING_PROJECT_REF, E2E_ADMIN_PASSWORD (source .env.staging first).');
  process.exit(1);
}
// Run the same guard the rest of the staging tooling uses — refuses to
// continue if this doesn't resolve to an explicitly allowlisted,
// non-production target.
execFileSync(process.execPath, [path.join(appRoot, 'scripts', 'staging', 'assertStagingTarget.mjs')], { stdio: 'inherit' });

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROJECT_A = 900001;
const PROJECT_A2 = 900002;
const PROJECT_B = 900003;

const USERS = [
  { key: 'adminA',              email: 'admin-a@staging.cert.local',              role: 'Admin',      company_id: 'company-a' },
  { key: 'pmAAssigned',         email: 'pm-a-assigned@staging.cert.local',        role: 'PM',         company_id: 'company-a', assigned_projects: [PROJECT_A] },
  { key: 'pmAUnassigned',       email: 'pm-a-unassigned@staging.cert.local',      role: 'PM',         company_id: 'company-a', assigned_projects: [] },
  { key: 'contractorAAssigned', email: 'contractor-a-assigned@staging.cert.local',role: 'Contractor', company_id: 'company-a', assigned_projects: [PROJECT_A] },
  { key: 'contractorAUnassigned', email: 'contractor-a-unassigned@staging.cert.local', role: 'Contractor', company_id: 'company-a', assigned_projects: [] },
  { key: 'viewerA',             email: 'viewer-a@staging.cert.local',             role: 'Viewer',     company_id: 'company-a' },
  { key: 'adminB',              email: 'admin-b@staging.cert.local',              role: 'Admin',      company_id: 'company-b' },
  { key: 'pmB',                 email: 'pm-b@staging.cert.local',                 role: 'PM',         company_id: 'company-b', assigned_projects: [PROJECT_B] },
  { key: 'contractorB',         email: 'contractor-b@staging.cert.local',         role: 'Contractor', company_id: 'company-b', assigned_projects: [PROJECT_B] },
];

const tmpDir = mkdtempSync(path.join(tmpdir(), 'staging-fixtures-'));

function runSql(sql, label) {
  const file = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sql`);
  writeFileSync(file, sql);
  try {
    // Windows can't directly spawn npx.cmd without going through a shell
    // (raises EINVAL) — shell:true resolves it the same way the rest of
    // this codebase's other cross-platform scripts handle npm-bin `.cmd`
    // wrappers.
    execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], { cwd: appRoot, stdio: 'pipe', encoding: 'utf8', shell: true });
  } catch (err) {
    console.error(`SQL FAILED (${label}):`, err.stdout || err.message);
    throw err;
  }
}

async function ensureUser(spec) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find(u => u.email === spec.email);
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updateError) throw new Error(`updateUser(${spec.email}): ${updateError.message}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${spec.email}): ${error.message}`);
  return data.user.id;
}

async function main() {
  console.log('Staging fixtures — target:', SUPABASE_URL, `(ref ${PROJECT_REF}, guarded by assertStagingTarget.mjs)`);

  const ids = {};
  for (const spec of USERS) {
    const id = await ensureUser(spec);
    ids[spec.key] = id;
    console.log(`  user ${spec.key.padEnd(24)} ${spec.email.padEnd(42)} -> ${id}`);
  }

  for (const spec of USERS) {
    const assigned = spec.assigned_projects ?? [];
    runSql(`
      INSERT INTO public.profiles (id, name, role, company_id, assigned_projects, email)
      VALUES ('${ids[spec.key]}', '${spec.key}', '${spec.role}', '${spec.company_id}', '{${assigned.join(',')}}', '${spec.email}')
      ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role, company_id = EXCLUDED.company_id,
        assigned_projects = EXCLUDED.assigned_projects, email = EXCLUDED.email;
    `, `profile:${spec.key}`);
  }
  console.log('  profiles upserted for all 9 users');

  runSql(`
    INSERT INTO public.projects (id, store_code, shopping_mall_name, company_id, project_status, target_opening_date, contractor_email)
    VALUES
      (${PROJECT_A}, 'STG-A1', 'Staging Mall A1', 'company-a', 'Active', CURRENT_DATE + INTERVAL '120 days', 'contractor-a-assigned@staging.cert.local'),
      (${PROJECT_A2}, 'STG-A2', 'Staging Mall A2', 'company-a', 'Active', CURRENT_DATE + INTERVAL '150 days', NULL),
      (${PROJECT_B}, 'STG-B1', 'Staging Mall B1', 'company-b', 'Active', CURRENT_DATE + INTERVAL '120 days', 'contractor-b@staging.cert.local')
    ON CONFLICT (id) DO UPDATE SET
      store_code = EXCLUDED.store_code,
      contractor_email = EXCLUDED.contractor_email;
    SELECT setval('public.projects_id_seq', 900100, false);
  `, 'projects');
  console.log(`  projects: A=${PROJECT_A} A2=${PROJECT_A2} (company-a), B=${PROJECT_B} (company-b)`);

  for (const pid of [PROJECT_A, PROJECT_A2, PROJECT_B]) {
    runSql(`
      DELETE FROM public.project_gantt_tasks WHERE project_id = ${pid};
      INSERT INTO public.project_gantt_tasks (project_id, wp_id, wp_label, phase_id, phase_label, is_archived)
      VALUES
        (${pid}, 'demo.walls', 'Demo Walls', 'demolition', 'Demolition', false),
        (${pid}, 'mep.electrical', 'MEP Electrical', 'mep', 'MEP', false),
        (${pid}, 'finish.paint', 'Finish Paint', 'finishes', 'Finishes', false),
        (${pid}, 'legacy.archived', 'Legacy Archived WP', 'demolition', 'Demolition', true);
    `, `gantt:${pid}`);
  }
  console.log('  gantt scope seeded (3 in-scope + 1 archived WP per project)');

  runSql(`
    INSERT INTO public.contractor_reports (id, project_id, submitted_by, report_date, week_number, overall_progress, status)
    VALUES (900201, ${PROJECT_A}, '${ids.contractorAAssigned}', CURRENT_DATE - 7, 1, 10, 'submitted')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.contractor_reports (id, project_id, submitted_by, report_date, week_number, overall_progress, status)
    VALUES (900202, ${PROJECT_B}, '${ids.contractorB}', CURRENT_DATE - 7, 1, 10, 'submitted')
    ON CONFLICT (id) DO NOTHING;
    SELECT setval('public.contractor_reports_id_seq', GREATEST(900299, (SELECT COALESCE(MAX(id), 900299) FROM public.contractor_reports)), true);
  `, 'contractor_reports');
  console.log('  pre-existing contractor reports: 900201 (Project A), 900202 (Project B)');

  runSql(`
    INSERT INTO public.site_visits (id, project_id, visit_date, visited_by, contractor_report_id, overall_note)
    VALUES (900401, ${PROJECT_A}, CURRENT_DATE - 3, '${ids.pmAAssigned}', 900201, 'Pre-existing staging fixture visit')
    ON CONFLICT (id) DO NOTHING;
    SELECT setval('public.site_visits_id_seq', GREATEST(900499, (SELECT COALESCE(MAX(id), 900499) FROM public.site_visits)), true);

    INSERT INTO public.progress_history (id, project_id, week_number, overall_progress, spi, snapshot)
    VALUES (900601, ${PROJECT_A}, 1, 10, 1.0, '{"source_type":"fixture","contractor_report_id":900201}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    SELECT setval('public.progress_history_id_seq', GREATEST(900699, (SELECT COALESCE(MAX(id), 900699) FROM public.progress_history)), true);
  `, 'site_visits+progress_history');
  console.log('  pre-existing site visit 900401, progress_history 900601');

  const state = {
    createdAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    projectRef: PROJECT_REF,
    password: PASSWORD,
    projects: { PROJECT_A, PROJECT_A2, PROJECT_B },
    preExisting: {
      contractorReportA: 900201,
      contractorReportB: 900202,
      siteVisitA: 900401,
      progressHistoryA: 900601,
    },
    users: Object.fromEntries(USERS.map(spec => [spec.key, { id: ids[spec.key], email: spec.email, role: spec.role, company_id: spec.company_id }])),
  };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`\nStaging fixture state written to ${STATE_PATH}`);
}

main()
  .then(() => { rmSync(tmpDir, { recursive: true, force: true }); process.exit(0); })
  .catch(err => {
    rmSync(tmpDir, { recursive: true, force: true });
    console.error('STAGING FIXTURE SETUP FAILED:', err.message || err);
    process.exit(1);
  });
