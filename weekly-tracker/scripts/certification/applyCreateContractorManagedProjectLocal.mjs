// Local-only Simplification Phase 3D.2 extension.
// Applies the hash-pinned 052 migration on top of the canonical fresh-install
// baseline + 046-051 (Contractor Schedule Draft/Submission/Lock foundation):
//   052: create_contractor_managed_project() SECURITY DEFINER RPC — the ONE
//        atomic command for the normal PM "Create Project" flow to create a
//        CONTRACTOR_MANAGED project, persist its Scope, and materialize one
//        null-dated project_gantt_tasks row per active Scope WP, all in one
//        transaction. See 052's own header for the full rationale.
//
// Deliberately NOT part of resetAndDeploy.mjs's always-on canonical chain —
// same opt-in posture as every post-041 feature addition in this repository
// (Snag List, Import Foundation, Master Catalog, Contractor Schedule) —
// reproducible via `npm run cert:reset:contractor-managed-project`, not
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
  ['052_create_contractor_managed_project.sql', '2ccd788db3103e4513a1bd8611687137661e442aab7d8ca444b2899d53522a1b'],
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

console.log('Local Create Contractor-Managed Project extension applied through 052 (atomic project + Scope + unscheduled-row creation); existing AUTO_GENERATED Create Project path unaffected.');
