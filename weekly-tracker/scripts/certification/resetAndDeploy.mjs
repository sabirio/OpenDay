// Sprint 4.5 — clean-reset + migration-chain-apply, reusable for Stage 3
// (first deploy) and Stage 13 (repeatability proof: reset -> fixtures ->
// tests -> cleanup -> reset must succeed twice in a row).
//
// `supabase db reset` truncates the local Postgres back to Supabase's own
// bootstrap schemas (auth/storage/realtime/etc.) with an EMPTY `public`
// schema (this project's migrations live in src/migrations/, not
// supabase/migrations/, so there is nothing for the CLI's own migration
// runner to replay — see docs/MIGRATION_CHAIN_AUDIT.md for why). This
// script re-applies this project's actual fresh-path chain by hand
// afterward, in the exact order certified in Stage 3: 000, 010,
// 012-025 (011 is excluded — see DEFECT-02 in
// docs/DATABASE_CERTIFICATION_REPORT.md).
//
// Run: node resetAndDeploy.mjs

import { execFileSync, execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', '..', 'src', 'migrations');
const weeklyTrackerDir = path.resolve(__dirname, '..', '..');

const FRESH_PATH = [
  '000_baseline.sql',
  '010_rls_by_roles.sql',
  // 011_ownership_uuid.sql intentionally excluded — DEFECT-02
  '012_invite_contractor.sql',
  '013_auth_user_role.sql',
  '014_site_photos_storage.sql',
  '015_audit_log.sql',
  '016_updated_at.sql',
  '017_site_photos_bucket_v2.sql',
  '018_submit_contractor_report_rpc.sql',
  '019_primary_key_defaults.sql',
  '020_rls_company_role_hardening.sql',
  '021_multi_tenant_hardening.sql',
  '022_fix_projects_select_self_reference.sql',
  '023_contractor_report_lookahead_fields.sql',
  '024_drop_dead_weight_overrides_column.sql',
  '025_atomic_write_commands.sql',
  '026_grant_authenticated_table_privileges.sql',
  '027_contractor_report_wp_validation.sql',
];

function psqlFile(file) {
  // stdio:'pipe' captures stdout/stderr on the thrown error object rather
  // than printing live — deliberately re-surfaced in main()'s catch below
  // so a failing migration shows its actual psql error, not just "Command
  // failed" with the output silently swallowed.
  execFileSync(
    'psql',
    [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file],
    { stdio: 'pipe', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` }, cwd: migrationsDir }
  );
}

function main() {
  console.log('1/2 supabase db reset (truncates public schema back to empty)...');
  execSync('npx --yes supabase db reset', { cwd: weeklyTrackerDir, stdio: 'inherit' });

  console.log(`\n2/2 applying fresh-path migration chain (000, 010, 012-${FRESH_PATH[FRESH_PATH.length - 1].slice(0, 3)})...`);
  const present = new Set(readdirSync(migrationsDir));
  for (const file of FRESH_PATH) {
    if (!present.has(file)) throw new Error(`Expected migration file missing: ${file}`);
    process.stdout.write(`  ${file} ... `);
    psqlFile(file);
    console.log('OK');
  }
  console.log(`\nClean deploy complete: empty DB -> ${FRESH_PATH.length} fresh-path migrations applied.`);
}

// Every other script in this harness (fixtures.mjs, the certify*.mjs
// scripts via lib.mjs's requireCertificationEnvironment) fails with a
// clear, actionable message and an explicit exit code. This script
// previously had neither — an uncaught exception from `supabase db reset`
// (e.g. Docker not running) or a failing psqlFile() call (e.g. a real SQL
// error in a migration) would print Node's raw uncaught-exception dump
// instead of saying which of the two steps failed or why, which is easy to
// miss or misread as "the script silently did nothing" when scrolled past
// in a long terminal session — exactly the ambiguity that made an
// `npm run test:certification` failure look like the orchestration itself
// was broken rather than a genuine upstream failure. No change to the
// happy path: same commands, same order, same exit code (0) on success.
try {
  main();
} catch (err) {
  console.error('\nCLEAN DEPLOY FAILED — one of the two steps above did not complete:');
  console.error(`  1. supabase db reset (Docker/Supabase CLI must be running — npx supabase start)`);
  console.error(`  2. applying the fresh-path migration chain (a real SQL error in one of the files)`);
  console.error(`\n${err.stdout ? err.stdout.toString() : ''}${err.stderr ? err.stderr.toString() : err.message}\n`);
  process.exit(1);
}
