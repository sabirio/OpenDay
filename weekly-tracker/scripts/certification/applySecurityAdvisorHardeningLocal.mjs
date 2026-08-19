// Local-only, hash-pinned security advisor hardening deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '147_security_advisor_hardening.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'a3dcd7a577a2035b2863bc73a1a50711e2c93a705e3a201a0e6f8d31ca6a60c8';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 147 hash mismatch');

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({ dbUrl: values.DB_URL, migrationId: '147_security_advisor_hardening', sha256: expected })) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: psqlEnv });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('147_security_advisor_hardening', 147, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Security advisor hardening applied and registered through 147.');
} else {
  console.log('Security advisor hardening already registered through 147; no SQL reapplied.');
}
