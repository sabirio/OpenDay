// Local-only, hash-pinned Product Capability Catalog deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '151_product_capability_catalog.sql';
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '080a71b081d4050cab5a5a849ef1453e5edcd028b55967ea70583debc52ff0c8';
const values = {
  API_URL: process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321',
  DB_URL: process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

assertLocalTarget({ apiUrl: values.API_URL, dbUrl: values.DB_URL, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 151 hash mismatch');
}

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({
  dbUrl: values.DB_URL,
  migrationId: '151_product_capability_catalog',
  sha256: expected,
})) {
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'inherit', env: psqlEnv,
  });
  execFileSync('psql', [values.DB_URL, '-v', 'ON_ERROR_STOP=1', '-c',
    `select private.register_schema_migration('151_product_capability_catalog', 151, '${filename}', '${expected}');`],
  { stdio: 'inherit', env: psqlEnv });
  console.log('Product Capability Catalog applied and registered through 151.');
} else {
  console.log('Product Capability Catalog already registered through 151; no SQL reapplied.');
}
