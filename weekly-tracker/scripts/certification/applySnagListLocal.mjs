// Local-only extension for authenticated UI certification.
// The canonical reset intentionally stops at migration 029; Snag List is a
// separately approved 030-035 batch. This script keeps that boundary explicit.

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
  ['030_snag_list_foundation.sql', '04843f8589fbaad18c6d47aa6733fc26b6bf52303d0bb8b4846819d725312bf0'],
  ['031_snag_reassignment_semantics.sql', '9b5a6f4fea1a4755c41d45066135e763329ddd1933969e04e22dfa932deffe1a'],
  ['032_snag_project_contractors_rpc.sql', 'b0495a7a0f1f51a288ba1480a84c468a22f2a2cb51245a537dbd9ea6f4566de3'],
  ['033_snag_private_plan_pinning.sql', '63d809642b79c23553c9fca6e1d3e1fc0e39e99780bde1eeff91c39fad0fb6fb'],
  ['034_snag_secure_evidence_lifecycle.sql', '0d71d6185e90bd083816d73cf939798dce276e971127948576f4d7702b55a53d'],
  ['035_snag_canonical_field_capture.sql', '0d02ee77c6001a2369c159b50350e45e23d6f1942ed0a4672b19699fee3bd52a'],
];

assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

for (const [file, expectedHash] of migrations) {
  const migrationPath = path.join(migrationsDir, file);
  // Manifest hashes bind the canonical Git blobs (LF). Windows checkouts may
  // materialize text files with CRLF, which is SQL-equivalent but bytewise
  // different. Normalize only line endings before verification so content
  // changes still fail closed on every platform.
  const canonicalBytes = Buffer.from(readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n'));
  const actualHash = createHash('sha256').update(canonicalBytes).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`REFUSING LOCAL SNAG DEPLOY: hash mismatch for ${file}`);
  }

  process.stdout.write(`  ${file} ... `);
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
    stdio: 'pipe',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
    cwd: migrationsDir,
  });
  console.log('OK');
}

console.log('Local UI certification extension applied through 035.');
