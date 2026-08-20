// Local-only, hash-pinned Organization / Tenant foundation deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '149_organization_tenant_foundation.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'b687811a2bc39456e09d71e5867aed1bf567e1bc0a497ad51ae2477fbc1995f3';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 149 hash mismatch');
}

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({
  dbUrl: values.DB_URL,
  migrationId: '149_organization_tenant_foundation',
  sha256: expected,
})) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'inherit', env: psqlEnv,
  });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('149_organization_tenant_foundation', 149, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Organization / Tenant foundation applied and registered through 149.');
} else {
  console.log('Organization / Tenant foundation already registered through 149; no SQL reapplied.');
}
