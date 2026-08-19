// Sprint 4.5 certification — Stage 4 controlled test fixtures.
// Creates: 2 companies, 9 users (auth.users + profiles) covering every role/
// assignment combination Stage 8's RLS matrix needs, 3 projects (2 in
// Company A, 1 in Company B), Gantt scope for each, one pre-existing
// contractor report per company, one pre-existing site visit, and one
// progress-history row — all with fixed, deterministic ids so every other
// certification script can reference them without re-querying.
//
// LOCAL ONLY — see env.mjs's assertLocal() guard. Run: node fixtures.mjs

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { SUPABASE_URL, SERVICE_ROLE_KEY, DB_URL, ANON_KEY } from './env.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';

try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
  if (!res.ok && res.status !== 404) throw new Error(`unexpected status ${res.status}`);
} catch (err) {
  console.error(`\nSKIPPED — ENVIRONMENT UNAVAILABLE: local Supabase stack is not reachable at ${SUPABASE_URL}.`);
  console.error('Run: npx supabase start (from weekly-tracker/), then node scripts/certification/resetAndDeploy.mjs first.');
  console.error(`(${err.message})\n`);
  process.exit(3);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'fixture-state.json');

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = getLocalFixturePassword();

// project ids are fixed/high so they never collide with the auto-increment
// sequence (which starts at 1 after 019_primary_key_defaults.sql)
const PROJECT_A = 900001;
const PROJECT_A2 = 900002;
const PROJECT_B = 900003;

const USERS = [
  { key: 'adminA',              email: 'admin-a@cert.local',              role: 'Admin',      company_id: 'company-a' },
  { key: 'pmAAssigned',         email: 'pm-a-assigned@cert.local',        role: 'PM',         company_id: 'company-a', assigned_projects: [PROJECT_A] },
  { key: 'pmAUnassigned',       email: 'pm-a-unassigned@cert.local',      role: 'PM',         company_id: 'company-a', assigned_projects: [] },
  { key: 'contractorAAssigned', email: 'contractor-a-assigned@cert.local',role: 'Contractor', company_id: 'company-a', assigned_projects: [PROJECT_A] },
  { key: 'contractorAUnassigned', email: 'contractor-a-unassigned@cert.local', role: 'Contractor', company_id: 'company-a', assigned_projects: [] },
  { key: 'viewerA',             email: 'viewer-a@cert.local',             role: 'Viewer',     company_id: 'company-a' },
  { key: 'adminB',              email: 'admin-b@cert.local',              role: 'Admin',      company_id: 'company-b' },
  { key: 'pmB',                 email: 'pm-b@cert.local',                 role: 'PM',         company_id: 'company-b', assigned_projects: [PROJECT_B] },
  { key: 'contractorB',         email: 'contractor-b@cert.local',         role: 'Contractor', company_id: 'company-b', assigned_projects: [PROJECT_B] },
];

function psql(sql) {
  return execFileSync(
    'psql',
    [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` } }
  ).trim();
}

async function ensureUser(spec) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find(u => u.email === spec.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById(${spec.email}): ${error.message}`);
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
  console.log('Sprint 4.5 fixtures — target:', SUPABASE_URL, '(local only, guarded by env.mjs)');

  const ids = {};
  for (const spec of USERS) {
    const id = await ensureUser(spec);
    ids[spec.key] = id;
    console.log(`  user ${spec.key.padEnd(24)} ${spec.email.padEnd(38)} -> ${id}`);
  }

  // Upsert profiles. Stage 2's grep of 000-025 found no profile-creation
  // trigger at the time this was written, but 028_production_security_reconciliation.sql
  // (part of the current fresh path) later added on_auth_user_created ->
  // handle_new_user(), which auto-inserts a profiles row (name =
  // split_part(email, '@', 1), role='Viewer') the moment ensureUser() above
  // creates the auth user — before this INSERT ever runs. Without
  // `name = EXCLUDED.name` in the ON CONFLICT SET, that trigger-derived
  // email-prefix name would silently survive every reset instead of the
  // deterministic name intended here.
  for (const spec of USERS) {
    const assigned = spec.assigned_projects ?? [];
    psql(`
      INSERT INTO public.profiles (id, name, role, company_id, assigned_projects, email)
      VALUES ('${ids[spec.key]}', '${spec.key}', '${spec.role}', '${spec.company_id}', '{${assigned.join(',')}}', '${spec.email}')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, role = EXCLUDED.role, company_id = EXCLUDED.company_id,
        assigned_projects = EXCLUDED.assigned_projects, email = EXCLUDED.email;
    `);
  }
  console.log('  profiles upserted for all 9 users');

  // A reused full-schema local database can contain Project Team rows from
  // earlier UI testing. Remove only the three deterministic certification
  // projects so capability-based access cannot leak into cross-tenant tests.
  // The guards keep this fixture compatible with the older canonical reset
  // path where Project Team tables do not exist yet.
  psql(`
    DO $fixture_project_team_cleanup$
    BEGIN
      IF to_regclass('public.project_team_membership_capabilities') IS NOT NULL THEN
        DELETE FROM public.project_team_membership_capabilities
        WHERE project_id IN (${PROJECT_A}, ${PROJECT_A2}, ${PROJECT_B});
      END IF;
      IF to_regclass('public.project_team_memberships') IS NOT NULL THEN
        DELETE FROM public.project_team_memberships
        WHERE project_id IN (${PROJECT_A}, ${PROJECT_A2}, ${PROJECT_B});
      END IF;
    END
    $fixture_project_team_cleanup$;
  `);

  // Projects (service_role bypasses RLS — legitimate for fixture seeding;
  // every certification scenario below re-verifies access through real
  // authenticated, non-service-role clients).
  psql(`
    INSERT INTO public.projects (id, store_code, shopping_mall_name, company_id, project_status, target_opening_date, contractor_email, created_by)
    VALUES
      (${PROJECT_A}, 'CERT-A1', 'Certification Mall A1', 'company-a', 'Active', CURRENT_DATE + INTERVAL '120 days', 'contractor-a-assigned@cert.local', '${ids.pmAAssigned}'),
      (${PROJECT_A2}, 'CERT-A2', 'Certification Mall A2', 'company-a', 'Active', CURRENT_DATE + INTERVAL '150 days', NULL, '${ids.pmAAssigned}'),
      (${PROJECT_B}, 'CERT-B1', 'Certification Mall B1', 'company-b', 'Active', CURRENT_DATE + INTERVAL '120 days', 'contractor-b@cert.local', '${ids.pmB}')
    ON CONFLICT (id) DO UPDATE SET
      store_code = EXCLUDED.store_code,
      shopping_mall_name = EXCLUDED.shopping_mall_name,
      company_id = EXCLUDED.company_id,
      project_status = EXCLUDED.project_status,
      target_opening_date = EXCLUDED.target_opening_date,
      contractor_email = EXCLUDED.contractor_email,
      created_by = EXCLUDED.created_by;
    SELECT setval('public.projects_id_seq', 900100, false);
  `);
  console.log(`  projects: A=${PROJECT_A} A2=${PROJECT_A2} (company-a), B=${PROJECT_B} (company-b)`);

  // Gantt scope: 3 in-scope WPs + 1 archived (out-of-scope) WP per project.
  for (const pid of [PROJECT_A, PROJECT_A2, PROJECT_B]) {
    psql(`
      DELETE FROM public.project_gantt_tasks WHERE project_id = ${pid};
      INSERT INTO public.project_gantt_tasks (project_id, wp_id, wp_label, phase_id, phase_label, is_archived)
      VALUES
        (${pid}, 'demo.walls', 'Demo Walls', 'demolition', 'Demolition', false),
        (${pid}, 'mep.electrical', 'MEP Electrical', 'mep', 'MEP', false),
        (${pid}, 'finish.paint', 'Finish Paint', 'finishes', 'Finishes', false),
        (${pid}, 'legacy.archived', 'Legacy Archived WP', 'demolition', 'Demolition', true);
    `);
  }
  console.log('  gantt scope seeded (3 in-scope + 1 archived WP per project)');

  // Pre-existing contractor report owned by Project A (Company A) and one
  // owned by Project B (Company B), for CR-04 cross-tenant read tests.
  psql(`
    INSERT INTO public.contractor_reports (id, project_id, submitted_by, report_date, week_number, overall_progress, status)
    VALUES (900201, ${PROJECT_A}, '${ids.contractorAAssigned}', CURRENT_DATE - 7, 1, 10, 'submitted')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.contractor_reports (id, project_id, submitted_by, report_date, week_number, overall_progress, status)
    VALUES (900202, ${PROJECT_B}, '${ids.contractorB}', CURRENT_DATE - 7, 1, 10, 'submitted')
    ON CONFLICT (id) DO NOTHING;
    SELECT setval(
      'public.contractor_reports_id_seq',
      GREATEST(COALESCE((SELECT max(id) FROM public.contractor_reports), 0) + 1, 900300),
      false
    );
  `);
  console.log('  pre-existing contractor reports: 900201 (Project A), 900202 (Project B)');

  // Pre-existing site visit + progress_history row on Project A, for SV-*/
  // progress-history read/replay tests.
  psql(`
    INSERT INTO public.site_visits (id, project_id, visit_date, visited_by, contractor_report_id, overall_note)
    VALUES (900401, ${PROJECT_A}, CURRENT_DATE - 3, '${ids.pmAAssigned}', 900201, 'Pre-existing fixture visit')
    ON CONFLICT (id) DO NOTHING;
    SELECT setval(
      'public.site_visits_id_seq',
      GREATEST(COALESCE((SELECT max(id) FROM public.site_visits), 0) + 1, 900500),
      false
    );

    INSERT INTO public.progress_history (id, project_id, week_number, overall_progress, spi, snapshot)
    VALUES (900601, ${PROJECT_A}, 1, 10, 1.0, '{"source_type":"fixture","contractor_report_id":900201}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    SELECT setval(
      'public.progress_history_id_seq',
      GREATEST(COALESCE((SELECT max(id) FROM public.progress_history), 0) + 1, 900700),
      false
    );
  `);
  console.log('  pre-existing site visit 900401, progress_history 900601');

  const state = {
    createdAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
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
  console.log(`\nFixture state written to ${STATE_PATH}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('FIXTURE SETUP FAILED:', err);
  process.exit(1);
});
