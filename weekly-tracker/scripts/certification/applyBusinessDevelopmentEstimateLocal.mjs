import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '157_business_development_estimate_foundation.sql';
const file = path.resolve(dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '9f459d5366ea081c47b989231ed996357fda4d17a5a572465135b269df170836';
const apiUrl = process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321';
const dbUrl = process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

assertLocalTarget({ apiUrl, dbUrl, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 157 hash mismatch');
const env = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({ dbUrl, migrationId: '157_business_development_estimate_foundation', sha256: expected })) {
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env });
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', `select private.register_schema_migration('157_business_development_estimate_foundation',157,'${filename}','${expected}');`], { stdio: 'inherit', env });
  console.log('Business Development Estimate Foundation applied and registered through 157.');
} else console.log('Business Development Estimate Foundation already registered through 157; no SQL reapplied.');
