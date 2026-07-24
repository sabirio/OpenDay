// Local-only extension for Import Foundation v1 Phase 2 (Retail Historical
// Project Profile schema + trusted commit layer). The canonical reset stops
// at migration 029; Snag List (030-035) and the Contractor Report legacy WP
// scope fix (036) are their own separately-approved batches; this is a
// third, independent addition (037-038 only touch `projects` and add
// `import_jobs` — no dependency on 030-036), following the exact same
// hash-pinned precedent as applySnagListLocal.mjs.

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
  ['037_retail_historical_project_profile.sql', 'b9823300ca093eb929e07b63677363dcc7cad653eae9611570544e49b601defa'],
  ['038_import_foundation_commit_layer.sql', 'a85a09f28428c02b0b15cde6c3bbd7b578bbe312693b364ed16f2aba0d830ffa'],
];

assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

for (const [file, expectedHash] of migrations) {
  const migrationPath = path.join(migrationsDir, file);
  // See applySnagListLocal.mjs's identical comment: manifest hashes bind the
  // canonical Git blob (LF); normalize line endings only, so content changes
  // still fail closed on every platform.
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

console.log('Local Import Foundation v1 Phase 2 extension applied through 038.');
