import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';
import { shouldApplyRegisteredMigration } from './localDbTarget.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const filename = '158_business_development_pricing_proposals.sql';
const file = path.resolve(dirname, '..', '..', 'src', 'migrations', filename);
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'd3dacd3a730b3e80d70f7593822051797aa9edcc40d346ce3173a9e9186a1e0c';
const apiUrl = process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321';
const dbUrl = process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

assertLocalTarget({ apiUrl, dbUrl, enabled: '1', projectId: 'weekly-tracker' });
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 158 hash mismatch');
const env = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
if (shouldApplyRegisteredMigration({ dbUrl, migrationId: '158_business_development_pricing_proposals', sha256: expected })) {
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env });
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', `select private.register_schema_migration('158_business_development_pricing_proposals',158,'${filename}','${expected}');`], { stdio: 'inherit', env });
  console.log('Business Development Pricing and Proposals applied and registered through 158.');
} else console.log('Business Development Pricing and Proposals already registered through 158; no SQL reapplied.');
