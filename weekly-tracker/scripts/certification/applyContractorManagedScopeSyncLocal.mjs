// Local-only Simplification Phase 3D.2.1 extension.
// Applies the hash-pinned 053-054 migrations on top of the canonical
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
  ['053_contractor_managed_project_scope_sync.sql', '9529be1c323934210a7130d7d35c8fd150ebcd50bdcdaab77e113857478aa8fa'],
  ['054_fix_contractor_managed_scope_null_artifact.sql', '3e69ad0c9b453074d667bc38b0984432ed33f7d0b42043df7f28d87a9569b77b'],
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

console.log('Local Contractor-Managed Scope Synchronization extension applied through 054 (atomic Scope + schedule-row sync, plus the null-artifact fix); AUTO_GENERATED Scope-edit/regenerateGantt path unaffected.');
