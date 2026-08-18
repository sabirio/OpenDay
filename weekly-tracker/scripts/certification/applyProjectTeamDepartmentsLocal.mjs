// Local-only, hash-pinned Project Team department deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '145_project_team_department_assignment.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '37cbafb1d184371e3ea6372fa62ea3546ed12ef2314bee0ef747fc72cf454ebe';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 145 hash mismatch');

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({ dbUrl: values.DB_URL, migrationId: '145_project_team_department_assignment', sha256: expected })) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: psqlEnv });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('145_project_team_department_assignment', 145, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Project Team department assignment applied and registered through 145.');
} else {
  console.log('Project Team department assignment already registered through 145; no SQL reapplied.');
}
