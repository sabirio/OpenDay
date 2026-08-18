// Local-only canonical financial source deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_API_URL, LOCAL_DB_URL as DB_URL } from './localDbTarget.mjs';
import { assertLocalTarget } from './localTargetGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', '134_canonical_financial_sources.sql');
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '64359a87734f6f274d7ea9b50b170303c1bb2e8ff34dabba6e8d77b9fc030c2f';

assertLocalTarget({
  apiUrl: LOCAL_API_URL,
  dbUrl: DB_URL,
  enabled: '1',
  projectId: 'weekly-tracker',
});
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 134 hash mismatch');
}
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
  stdio: 'inherit',
  env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` },
});
console.log('Canonical financial sources applied locally through 134.');
