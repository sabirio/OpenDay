// Local-only, hash-pinned Effective Entitlement Resolver deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '153_effective_entitlement_resolver.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'bac815419b0ae0c3f680907cef041767dc066f4d3c416af0cc109bbd37a676b9';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 153 hash mismatch');
}

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({
  dbUrl: values.DB_URL,
  migrationId: '153_effective_entitlement_resolver',
  sha256: expected,
})) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'inherit', env: psqlEnv,
  });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('153_effective_entitlement_resolver', 153, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Effective Entitlement Resolver applied and registered through 153.');
} else {
  console.log('Effective Entitlement Resolver already registered through 153; no SQL reapplied.');
}
