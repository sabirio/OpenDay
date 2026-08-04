// Local-only Simplification Phase 3D.2.1 extension.
// Applies the hash-pinned 053-058 migrations on top of the canonical
// fresh-install baseline + 046-051 (Contractor Schedule Draft/Submission/Lock
// foundation) + 052 (atomic Create Contractor-Managed Project):
//   053: update_contractor_managed_project_scope() SECURITY DEFINER RPC —
//        the ONE atomic command for editing an existing CONTRACTOR_MANAGED
//        project's Scope, keeping project_gantt_tasks synchronized (added/
//        removed/retained/re-entering WPs) in the same transaction. See
//        053's own header for the full rationale.
//   054: fixes a genuine defect in 052 discovered while building 053 — the
//        create command stored a JSONB null SCALAR for an unset Scope
//        instead of a true SQL NULL, causing 051's Scope-mutation lock
//        trigger to misfire on an ordinary, semantically-no-op metadata
//        edit. See 054's own header for the full rationale.
//   055: removes Supabase default anon EXECUTE grants from Contractor-Managed
//        Schedule RPCs and trigger-only functions while retaining the
//        intended authenticated RPC access.
//   056: removes Supabase default PUBLIC/anon/service_role EXECUTE grants
//        from the three 020 RLS helper functions (can_admin_company,
//        can_create_project, can_write_project) while retaining the
//        intended authenticated access. Same excess-ACL closure pattern as
//        055, function-ACL only; service_role is explicitly revoked (not
//        left implicit) since no code path requires it.
//   057: bridges migration 028 Part 5's never-effective outcome (Gate 13C,
//        Simplification Phase 3E.5) for all 15 tables it named plus every
//        associated sequence — anon/PUBLIC get nothing, authenticated is
//        narrowed to exactly 026's audited SELECT/INSERT/UPDATE/DELETE (or
//        SELECT-only for audit_log) with sequence USAGE only (never
//        TRUNCATE/REFERENCES/TRIGGER/MAINTAIN), service_role gets an
//        exact, evidence-backed per-table/per-sequence grant derived from
//        a repository-wide audit of genuine service-role PostgREST call
//        sites (not a blanket "trusted role" grant) — 6 of the 15 tables
//        get nothing at all.
//

// Deliberately NOT part of resetAndDeploy.mjs's always-on canonical chain —
// same opt-in posture as every post-041 feature addition in this repository —
// reproducible via `npm run cert:reset:contractor-managed-scope-sync`, not
// something every fresh local environment gets by default.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';

const DB_URL = process.env.CERT_DB_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', '..', 'src', 'migrations');
const migrations = [
  ['053_contractor_managed_project_scope_sync.sql', 'a0b1ea7910d35c18709f40b3535c1303501f5539b824574dd0b73aa577a6d64f'],
  ['054_fix_contractor_managed_scope_null_artifact.sql', 'a84040891bb20262f40a31c94c455465534bf2be4e963ec78558a92b1565d158'],
  ['055_restrict_contractor_schedule_function_acl.sql', '8db03764d989e20ee7f47aa9f7e05da8eca32488ae10f1948bef80643618c59c'],
  ['056_restrict_rls_helper_function_acl.sql', '1150ef166ef7d6c01efc565ba3c3e8fa33f4b9e8821cdf4d987cc9763bd4021a'],
  ['057_part5_table_sequence_acl_bridge.sql', 'e563821f1d0e50c4fa222356d649dcce358121c995102ad01a916bc56cf18827'],
  ['058_reconcile_atomic_write_security_and_contractor_rpc.sql', '21c05f99162576b737a1b41810786355047616762d816ac142f36483c4e9110d'],
];

assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

for (const [file, expectedHash] of migrations) {
  const migrationPath = path.join(migrationsDir, file);
  const canonicalBytes = Buffer.from(readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n'));
  const actualHash = createHash('sha256').update(canonicalBytes).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`REFUSING LOCAL DEPLOY: hash mismatch for ${file}`);
  }

  process.stdout.write(`  ${file} ... `);
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
    stdio: 'pipe',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
    cwd: migrationsDir,
  });
  console.log('OK');
}

console.log('Local Contractor-Managed Scope Synchronization extension applied through 058 (atomic Scope + schedule-row sync, null-artifact fix, ACL hardening, Part-5 bridge, and atomic-write reconciliation); AUTO_GENERATED Scope-edit/regenerateGantt path unaffected.');
