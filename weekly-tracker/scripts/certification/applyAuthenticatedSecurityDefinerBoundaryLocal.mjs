// Local-only, hash-pinned authenticated SECURITY DEFINER boundary deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '148_authenticated_security_definer_boundary.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '3b6b20382f02c39bd7664143d92313c61b4a1a13ef3045d8f6c54369d8a5dc29';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 148 hash mismatch');

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({ dbUrl: values.DB_URL, migrationId: '148_authenticated_security_definer_boundary', sha256: expected })) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: psqlEnv });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('148_authenticated_security_definer_boundary', 148, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Authenticated SECURITY DEFINER boundary applied and registered through 148.');
} else {
  console.log('Authenticated SECURITY DEFINER boundary already registered through 148; no SQL reapplied.');
}
