// Local-only, hash-pinned Platform Entitlement Control Plane deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '154_platform_entitlement_control_plane.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'b782ee1a981d4506b0a4bc501cf3721aec4851159b78f28a6d0c99e5122e1e5a';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 154 hash mismatch');
}

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({
  dbUrl: values.DB_URL,
  migrationId: '154_platform_entitlement_control_plane',
  sha256: expected,
})) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'inherit', env: psqlEnv,
  });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('154_platform_entitlement_control_plane', 154, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Platform Entitlement Control Plane applied and registered through 154.');
} else {
  console.log('Platform Entitlement Control Plane already registered through 154; no SQL reapplied.');
}
