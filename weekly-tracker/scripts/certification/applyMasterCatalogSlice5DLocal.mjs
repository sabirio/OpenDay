// Local-only extension for Slice 5D — materializes the approved 221-WP
// Retail Fit-Out Master Catalog as an inactive, non-default templates row
// (version 2, family retail-fitout-v2). Purely a data INSERT (no schema/RLS
// change), so — same as 030-040, 042 before it — it deliberately does not
// belong in scripts/contracts/canonical-security-contract.json's
// canonicalMigrationPath (that contract is scoped to rls/policies/functions/
// privileges). Same hash-pinned precedent as applyMasterCatalogSchemaV2Local.mjs.

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
  ['043_retail_fitout_master_catalog.sql', 'db527766054a59831e4826429a96249050640ee89c5f023832db0f752e87d59e'],
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

console.log('Local Master Catalog (Slice 5D, 221-WP candidate) extension applied through 043.');
