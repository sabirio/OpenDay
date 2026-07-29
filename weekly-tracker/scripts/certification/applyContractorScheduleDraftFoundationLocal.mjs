// Local-only Simplification Phase 3B extension. Applies the hash-pinned
// 046 migration (schedule_ownership_mode column, default AUTO_GENERATED,
// plus the save_contractor_schedule_draft SECURITY DEFINER RPC) on top of
// the canonical fresh-install baseline.
//
// Deliberately NOT part of resetAndDeploy.mjs's always-on canonical chain —
// same posture as the Master Catalog slices (042-045): this is foundation
// work that must be applied as an explicit, separate step, not something
// every fresh local environment gets by default, until a later phase
// activates the Contractor Schedule workflow for real. Applying it is also
// what keeps canonical-security-contract.json honest — that file's RLS/
// policy/function/privilege sections are derived by executing the
// canonical chain only; a brand-new SECURITY DEFINER RPC and CHECK
// constraint belong in canonicalMigrationPath.included only after that
// derivation pipeline has actually run against them, which this slice does
// not do.

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
  ['046_contractor_schedule_draft_foundation.sql', '989d09af15d4ed2d216cd0d0f51805ea8a080dc789cb3f1149289e0e738b2fa8'],
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

console.log('Local Contractor Schedule Draft foundation applied through 046; existing AUTO_GENERATED projects unaffected, workflow not yet activated.');
