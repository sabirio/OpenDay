// Local-only extension for Slice 5C's Master Catalog schema-v2 template
// contract. The canonical security-contract reset (resetAndDeploy.mjs) stops
// at 041 — this migration only widens 041's own templates CHECK constraint
// to additionally accept schemaVersion 2 rows (no RLS/policy/privilege
// change), so it deliberately does not belong in
// scripts/contracts/canonical-security-contract.json's canonicalMigrationPath
// (that contract is scoped to rls/policies/functions/privileges — see its own
// description — and 030-040 are excluded from it for the identical reason).
// Same hash-pinned precedent as applySnagListLocal.mjs /
// applyContractorReportLegacyWpScopeLocal.mjs / applyImportFoundationPhase2Local.mjs.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';
import { assertLocalTarget } from './localTargetGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', '..', 'src', 'migrations');
const migrations = [
  ['042_master_catalog_schema_v2.sql', 'b8c883e12c63c90388a2833b11ab93c40437888be74dc05c6fd934bf15415776'],
];

assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

for (const [file, expectedHash] of migrations) {
  const migrationPath = path.join(migrationsDir, file);
  // Manifest hash binds the canonical Git blob (LF); normalize line endings
  // only, so content changes still fail closed on every platform.
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

console.log('Local Master Catalog schema-v2 extension applied through 042.');
