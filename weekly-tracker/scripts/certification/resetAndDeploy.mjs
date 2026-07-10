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
];

function psqlFile(file) {
  execFileSync(
    'psql',
    [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file],
    { stdio: 'pipe', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` }, cwd: migrationsDir }
  );
}

function main() {
  console.log('1/2 supabase db reset (truncates public schema back to empty)...');
  execSync('npx --yes supabase db reset', { cwd: weeklyTrackerDir, stdio: 'inherit' });

  console.log('\n2/2 applying fresh-path migration chain (000, 010, 012-026)...');
  const present = new Set(readdirSync(migrationsDir));
  for (const file of FRESH_PATH) {
    if (!present.has(file)) throw new Error(`Expected migration file missing: ${file}`);
    process.stdout.write(`  ${file} ... `);
    psqlFile(file);
    console.log('OK');
  }
  console.log(`\nClean deploy complete: empty DB -> ${FRESH_PATH.length} fresh-path migrations applied.`);
}

main();
