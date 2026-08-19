// Local-only, hash-pinned Organization Admin Foundation deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '155_organization_admin_foundation.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '88fc840477a31ab5d4e9563d08d051b21ab8525f57fb7ae3e46a87bd060b47bb';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 155 hash mismatch');
}

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({
  dbUrl: values.DB_URL,
  migrationId: '155_organization_admin_foundation',
  sha256: expected,
})) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'inherit', env: psqlEnv,
  });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('155_organization_admin_foundation', 155, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Organization Admin Foundation applied and registered through 155.');
} else {
  console.log('Organization Admin Foundation already registered through 155; no SQL reapplied.');
}
