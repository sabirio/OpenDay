// Contractor Workspace v1 — LOCAL-ONLY deterministic end-to-end test dataset.
//
// Reuses the existing local-target guard (env.mjs -> localTargetGuard.mjs)
// and fixture password mechanism (fixturePassword.mjs) — no new guard, no
// new password system, no new fixture framework. Layers on top of
// fixtures.mjs's existing Admin fixture (admin-a@cert.local, company-a)
// rather than creating a second Admin.
//
// Six deterministic projects exercise every Contractor Workspace v1 surface:
// report recency (missing/current), snag actionability (ASSIGNED/IN_PROGRESS
// vs CLOSED), overdue due dates (deriveDueState), cross-contractor isolation,
// and an unassigned project used to prove scope can't leak. See the
// per-project comments below for the exact expected engine output — those
// numbers are also asserted by this script itself (run: node
// scripts/certification/contractorWorkspaceFixtures.mjs).
//
// Idempotent: re-running clears and rebuilds only these six projects'
// contractor_reports/snags (never touches any other project's data), and
// upserts the same three contractor profiles by fixed email.
//
// SCHEMA IS NEVER APPLIED HERE. This fixture only ever manages fixture DATA —
// it validates the required schema is present and fails clearly otherwise.
// The canonical local reset path is a two-part, already-existing composition:
// resetAndDeploy.mjs (000-029, via the frozen production security contract)
// + applySnagListLocal.mjs (the separately hash-approved 030-035 Snag List
// batch) — see cert:reset:ui's own precedent. The cert:seed:contractor-workspace
// npm script chains both before this file, so admin-a@cert.local AND the
// snags table are both guaranteed to exist by the time main() runs.
//
// Run: npm run cert:seed:contractor-workspace (recommended — chains the full
// reset+extension+seed pipeline), or node scripts/certification/
// contractorWorkspaceFixtures.mjs directly once that pipeline has already
// been run at least once.

import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { getLocalFixturePassword } from './fixturePassword.mjs';

let SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL;
try {
  ({ SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = await import('./env.mjs'));
} catch (err) {
  console.error('BLOCKED: local Supabase target could not be proven.');
  console.error(`  ${err.message}`);
  process.exit(1);
}

try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
  if (!res.ok && res.status !== 404) throw new Error(`unexpected status ${res.status}`);
} catch (err) {
  console.error(`\nSKIPPED — ENVIRONMENT UNAVAILABLE: local Supabase stack is not reachable at ${SUPABASE_URL}.`);
  console.error('Run: npx supabase start (from weekly-tracker/), then npm run cert:reset:local first.');
  console.error(`(${err.message})\n`);
  process.exit(3);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = getLocalFixturePassword();
const ADMIN_EMAIL = 'admin-a@cert.local';

// Fixed, non-colliding ID range — separate from fixtures.mjs's 900001-900003/
// 900201-900202/900401/900601 and seed-test-data.sql's 910001.
const PROJECT = {
  ALPHA: 950001,      // KZ-TEST-01 Alpha Mall              — Contractor A, Up to Date
  MEGA: 950002,        // KZ-TEST-02 Mega Center             — Contractor A, Strong Attention
  DOSTYK: 950003,      // KZ-TEST-03 Dostyk Plaza            — Contractor A, Missing Report
  FORUM: 950004,       // KZ-TEST-04 Forum                   — Contractor B, Attention (observations)
  ESENTAI: 950005,     // KZ-TEST-05 Esentai                 — Contractor B, Attention (missing report)
  UNASSIGNED: 950006,  // KZ-TEST-06 Unassigned Test Project — no contractor assignment
};

const USERS = [
  { key: 'contractorA', email: 'contractor-ws-a@cert.local', role: 'Contractor', company_id: 'company-a',
    assigned_projects: [PROJECT.ALPHA, PROJECT.MEGA, PROJECT.DOSTYK] },
  { key: 'contractorB', email: 'contractor-ws-b@cert.local', role: 'Contractor', company_id: 'company-a',
    assigned_projects: [PROJECT.FORUM, PROJECT.ESENTAI] },
  { key: 'contractorUnassigned', email: 'contractor-ws-unassigned@cert.local', role: 'Contractor', company_id: 'company-a',
    assigned_projects: [] },
];

function psql(sql) {
  return execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
  }).trim();
}

// Fixture DATA only — never applies or repairs schema. If the required
// schema is missing, this fails clearly and tells the operator which
// command actually owns applying it (applySnagListLocal.mjs, chained by
// cert:seed:contractor-workspace), rather than silently patching it here.
function assertSnagSchemaPresent() {
  const snagsExists = psql("SELECT to_regclass('public.snags') IS NOT NULL;");
  if (snagsExists !== 't') {
    throw new Error(
      'FAIL: Contractor Workspace fixture requires the current local schema (through migration 035), ' +
      'but public.snags does not exist. Run "npm run cert:seed:contractor-workspace" ' +
      '(or "npm run cert:reset:local && node scripts/certification/applySnagListLocal.mjs") first, ' +
      'then re-run this fixture.'
    );
  }
}

async function listAllUsers() {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

async function ensureUser(spec, existingUsers) {
  const existing = existingUsers.find(u => u.email === spec.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`updateUserById(${spec.email}): ${error.message}`);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email: spec.email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser(${spec.email}): ${error.message}`);
  return data.user.id;
}

async function main() {
  console.log('Contractor Workspace v1 local fixtures — target:', SUPABASE_URL, '(local only, guarded by env.mjs)');

  assertSnagSchemaPresent();

  const existingUsers = await listAllUsers();
  const adminUser = existingUsers.find(u => u.email === ADMIN_EMAIL);
  if (!adminUser) {
    throw new Error(`Expected existing Admin fixture ${ADMIN_EMAIL} not found — run "npm run cert:reset:local" first.`);
  }
  const adminId = adminUser.id;
  console.log(`  reusing existing Admin fixture ${ADMIN_EMAIL} -> ${adminId}`);

  const ids = {};
  for (const spec of USERS) {
    ids[spec.key] = await ensureUser(spec, existingUsers);
    console.log(`  user ${spec.key.padEnd(20)} ${spec.email.padEnd(38)} -> ${ids[spec.key]}`);
  }

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
  console.log('  profiles upserted for all 3 contractor users');

  // Clean slate for exactly these six fixture projects' operational data —
  // never touches any other project. snags -> snag_events/snag_evidence/
  // snag_comments cascade automatically (ON DELETE CASCADE, migration 030).
  const allIds = Object.values(PROJECT).join(',');
  psql(`DELETE FROM public.snags WHERE project_id IN (${allIds});`);
  psql(`DELETE FROM public.contractor_reports WHERE project_id IN (${allIds});`);
  console.log('  cleared prior contractor_reports/snags for fixture projects 950001-950006 (idempotent)');

  psql(`
    INSERT INTO public.projects (id, store_code, shopping_mall_name, company_id, project_status, target_opening_date)
    VALUES
      (${PROJECT.ALPHA},      'KZ-TEST-01', 'Alpha Mall',              'company-a', 'Active', CURRENT_DATE + INTERVAL '120 days'),
      (${PROJECT.MEGA},       'KZ-TEST-02', 'Mega Center',             'company-a', 'Active', CURRENT_DATE + INTERVAL '90 days'),
      (${PROJECT.DOSTYK},     'KZ-TEST-03', 'Dostyk Plaza',            'company-a', 'Active', CURRENT_DATE + INTERVAL '60 days'),
      (${PROJECT.FORUM},      'KZ-TEST-04', 'Forum',                   'company-a', 'Active', CURRENT_DATE + INTERVAL '100 days'),
      (${PROJECT.ESENTAI},    'KZ-TEST-05', 'Esentai',                 'company-a', 'Active', CURRENT_DATE + INTERVAL '80 days'),
      (${PROJECT.UNASSIGNED}, 'KZ-TEST-06', 'Unassigned Test Project', 'company-a', 'Active', CURRENT_DATE + INTERVAL '150 days')
    ON CONFLICT (id) DO UPDATE SET
      store_code = EXCLUDED.store_code, shopping_mall_name = EXCLUDED.shopping_mall_name,
      company_id = EXCLUDED.company_id, project_status = EXCLUDED.project_status,
      target_opening_date = EXCLUDED.target_opening_date;
    SELECT setval('public.projects_id_seq', 950100, false);
  `);
  console.log('  six KZ-TEST projects upserted (950001-950006)');

  // ── Contractor Reports — report-recency scenario ────────────────────────
  // isMissingReport() (utils/reportUtils.js, used by contractorWorkspaceEngine.js)
  // flags a project when the latest report is >7 days old, or there is none
  // at all. Dates are relative offsets from CURRENT_DATE so the scenario is
  // logically identical on every re-run.
  psql(`
    -- KZ-TEST-01 Alpha Mall: 3 historical reports, latest 2 days ago -> NOT missing
    INSERT INTO public.contractor_reports (project_id, submitted_by, report_date, week_number, overall_progress, status) VALUES
      (${PROJECT.ALPHA}, '${ids.contractorA}', CURRENT_DATE - 30, 1, 20, 'submitted'),
      (${PROJECT.ALPHA}, '${ids.contractorA}', CURRENT_DATE - 14, 2, 45, 'submitted'),
      (${PROJECT.ALPHA}, '${ids.contractorA}', CURRENT_DATE - 2,  3, 60, 'submitted');

    -- KZ-TEST-02 Mega Center: 3 historical reports, latest 15 days ago -> missing
    INSERT INTO public.contractor_reports (project_id, submitted_by, report_date, week_number, overall_progress, status) VALUES
      (${PROJECT.MEGA}, '${ids.contractorA}', CURRENT_DATE - 45, 1, 10, 'submitted'),
      (${PROJECT.MEGA}, '${ids.contractorA}', CURRENT_DATE - 30, 2, 25, 'submitted'),
      (${PROJECT.MEGA}, '${ids.contractorA}', CURRENT_DATE - 15, 3, 35, 'submitted');

    -- KZ-TEST-03 Dostyk Plaza: no report at all (intentional)

    -- KZ-TEST-04 Forum: recent report -> NOT missing
    INSERT INTO public.contractor_reports (project_id, submitted_by, report_date, week_number, overall_progress, status) VALUES
      (${PROJECT.FORUM}, '${ids.contractorB}', CURRENT_DATE - 20, 1, 15, 'submitted'),
      (${PROJECT.FORUM}, '${ids.contractorB}', CURRENT_DATE - 2,  2, 40, 'submitted');

    -- KZ-TEST-05 Esentai: no report at all (intentional)

    -- KZ-TEST-06 Unassigned: report history exists but no contractor is scoped
    -- to this project - proves report history alone doesn't leak either.
    INSERT INTO public.contractor_reports (project_id, submitted_by, report_date, week_number, overall_progress, status) VALUES
      (${PROJECT.UNASSIGNED}, '${adminId}', CURRENT_DATE - 40, 1, 10, 'submitted'),
      (${PROJECT.UNASSIGNED}, '${adminId}', CURRENT_DATE - 25, 2, 20, 'submitted');
  `);
  console.log('  contractor_reports seeded per scenario');

  // ── Snags / observations — actionability + overdue scenario ─────────────
  // Actionability derives from core/snags/workflow.js's getAvailableSnagActions
  // (ASSIGNED/IN_PROGRESS + assigned to the actor = actionable; CLOSED/CANCELLED
  // never actionable regardless of due date). Overdue derives purely from
  // snag.dueDate vs today via engines/snagReadModelEngine.js's deriveDueState —
  // no fixture-only status field is set anywhere.
  psql(`
    -- KZ-TEST-01 Alpha Mall: zero actionable. One CLOSED historical observation
    -- proves closed work never counts.
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by, closed_at) VALUES
      (${PROJECT.ALPHA}, 1, 'Fixture: resolved paint touch-up', 'Historical, closed', 'FINISH', 'ARCH', 'LOW', 'CLOSED', '${ids.contractorA}', CURRENT_DATE - 20, 'Level 1, Unit 4', '${ids.contractorA}', now());

    -- KZ-TEST-02 Mega Center: 5 actionable (2 overdue, 3 not), 1 closed (must not count)
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by) VALUES
      (${PROJECT.MEGA}, 1, 'Fixture: cracked tile (overdue)', '', 'FINISH', 'ARCH', 'HIGH',     'ASSIGNED',    '${ids.contractorA}', CURRENT_DATE - 5,  'Level 2, Corridor A', '${ids.contractorA}'),
      (${PROJECT.MEGA}, 2, 'Fixture: exposed wiring (overdue)', '', 'MEP',    'ELEC', 'CRITICAL', 'IN_PROGRESS', '${ids.contractorA}', CURRENT_DATE - 3,  'Level 2, Riser Room', '${ids.contractorA}'),
      (${PROJECT.MEGA}, 3, 'Fixture: door alignment (future due)', '', 'FINISH', 'ARCH', 'MEDIUM', 'ASSIGNED',    '${ids.contractorA}', CURRENT_DATE + 30, 'Level 1, Entrance',   '${ids.contractorA}'),
      (${PROJECT.MEGA}, 4, 'Fixture: HVAC noise (future due)', '', 'MEP',      'HVAC', 'MEDIUM', 'IN_PROGRESS', '${ids.contractorA}', CURRENT_DATE + 60, 'Level 3, Plant Room', '${ids.contractorA}'),
      (${PROJECT.MEGA}, 5, 'Fixture: signage missing (no due date)', '', 'FINISH', 'ARCH', 'LOW', 'ASSIGNED',    '${ids.contractorA}', NULL,               'Level 1, Lobby',      '${ids.contractorA}');
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by, closed_at) VALUES
      (${PROJECT.MEGA}, 6, 'Fixture: resolved leak (historical closed)', '', 'MEP', 'PLUMB', 'HIGH', 'CLOSED', '${ids.contractorA}', CURRENT_DATE - 10, 'Level 2, Restroom', '${ids.contractorA}', now());

    -- KZ-TEST-03 Dostyk Plaza: 3 actionable, 0 overdue
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by) VALUES
      (${PROJECT.DOSTYK}, 1, 'Fixture: floor scratch (future due)', '', 'FINISH', 'ARCH', 'LOW',    'ASSIGNED',    '${ids.contractorA}', CURRENT_DATE + 14, 'Level 1, Unit 2', '${ids.contractorA}'),
      (${PROJECT.DOSTYK}, 2, 'Fixture: ceiling tile (no due date)', '', 'FINISH', 'ARCH', 'MEDIUM', 'IN_PROGRESS', '${ids.contractorA}', NULL,               'Level 2, Unit 8', '${ids.contractorA}'),
      (${PROJECT.DOSTYK}, 3, 'Fixture: paint mismatch (future due)', '', 'FINISH', 'ARCH', 'LOW',   'ASSIGNED',    '${ids.contractorA}', CURRENT_DATE + 21, 'Level 1, Unit 3', '${ids.contractorA}');

    -- KZ-TEST-04 Forum: 4 actionable (1 overdue), 1 closed (must not count)
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by) VALUES
      (${PROJECT.FORUM}, 1, 'Fixture: fire door gap (overdue)', '', 'FIRE',   'ARCH', 'CRITICAL', 'ASSIGNED',    '${ids.contractorB}', CURRENT_DATE - 4,  'Level 1, Stairwell B', '${ids.contractorB}'),
      (${PROJECT.FORUM}, 2, 'Fixture: light fixture flicker', '', 'MEP',      'ELEC', 'MEDIUM',   'IN_PROGRESS', '${ids.contractorB}', CURRENT_DATE + 10, 'Level 3, Corridor',    '${ids.contractorB}'),
      (${PROJECT.FORUM}, 3, 'Fixture: grout gap', '', 'FINISH',               'ARCH', 'LOW',      'ASSIGNED',    '${ids.contractorB}', CURRENT_DATE + 45, 'Level 1, Restroom',    '${ids.contractorB}'),
      (${PROJECT.FORUM}, 4, 'Fixture: HVAC vent dust (no due date)', '', 'MEP','HVAC', 'LOW',      'ASSIGNED',    '${ids.contractorB}', NULL,               'Level 2, Office',      '${ids.contractorB}');
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by, closed_at) VALUES
      (${PROJECT.FORUM}, 5, 'Fixture: resolved trip hazard (historical closed)', '', 'SAFETY', 'ARCH', 'HIGH', 'CLOSED', '${ids.contractorB}', CURRENT_DATE - 8, 'Level 1, Loading Dock', '${ids.contractorB}', now());

    -- KZ-TEST-05 Esentai: zero snags (intentional)

    -- KZ-TEST-06 Unassigned: 3 actionable (1 overdue), deliberately assigned to
    -- Contractor A's own id - the strongest isolation proof, since even a snag
    -- literally assigned to Contractor A must not surface unless the PROJECT
    -- itself is in their assigned_projects.
    INSERT INTO public.snags (project_id, snag_number, title, description, category_code, discipline_code, priority, status, assignee_id, due_date, location_text, created_by) VALUES
      (${PROJECT.UNASSIGNED}, 1, 'Fixture: unassigned-project overdue observation', '', 'FINISH', 'ARCH', 'HIGH',   'ASSIGNED',    '${ids.contractorA}', CURRENT_DATE - 6,  'Level 1, Unit 1', '${adminId}'),
      (${PROJECT.UNASSIGNED}, 2, 'Fixture: unassigned-project future observation', '', 'MEP',    'ELEC', 'MEDIUM', 'IN_PROGRESS', '${ids.contractorA}', CURRENT_DATE + 20, 'Level 1, Unit 2', '${adminId}'),
      (${PROJECT.UNASSIGNED}, 3, 'Fixture: unassigned-project no-due observation', '', 'FINISH', 'ARCH', 'LOW',    'ASSIGNED',    '${ids.contractorA}', NULL,               'Level 1, Unit 3', '${adminId}');
  `);
  console.log('  snags/observations seeded per scenario (isolation snag deliberately assigned to Contractor A)');

  console.log('\nContractor Workspace v1 fixtures ready.');
  console.log(`  Admin (reused):         ${ADMIN_EMAIL}`);
  console.log(`  Contractor A:           ${USERS[0].email}`);
  console.log(`  Contractor B:           ${USERS[1].email}`);
  console.log(`  Contractor Unassigned:  ${USERS[2].email}`);
  console.log(`  Password (all fixture users): ${PASSWORD}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('CONTRACTOR WORKSPACE FIXTURE SETUP FAILED:', err);
  process.exit(1);
});
