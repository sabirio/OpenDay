// Local-only, hash-pinned Project Procurement Strategy deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_API_URL, LOCAL_DB_URL as DB_URL, shouldApplyRegisteredMigration } from './localDbTarget.mjs';
import { assertLocalTarget } from './localTargetGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '144_project_procurement_strategy.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '62839951fb570b5ba56d9c6817de058623c3c68f3dcc8369389ccbc494e3800e';
const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };

assertLocalTarget({
  apiUrl: LOCAL_API_URL,
  dbUrl: DB_URL,
  enabled: '1',
  projectId: 'weekly-tracker',
});
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 144 hash mismatch');

if (shouldApplyRegisteredMigration({ dbUrl: DB_URL, migrationId: '144_project_procurement_strategy', sha256: expected })) {
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: psqlEnv });
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('144_project_procurement_strategy', 144, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Project Procurement Strategy applied and registered through 144.');
} else {
  console.log('Project Procurement Strategy already registered through 144; no SQL reapplied.');
}
