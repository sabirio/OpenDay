// Local-only Project Team / RLS alignment deployment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_API_URL, LOCAL_DB_URL as DB_URL } from './localDbTarget.mjs';
import { assertLocalTarget } from './localTargetGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', '133_project_access_alignment.sql');
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = '569ddcb47042f79cf71bc88af9d1f78e53e940925d2530ea2090b86e3f79aa66';

assertLocalTarget({
  apiUrl: LOCAL_API_URL,
  dbUrl: DB_URL,
  enabled: '1',
  projectId: 'weekly-tracker',
});
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 133 hash mismatch');
}
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
  stdio: 'inherit',
  env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` },
});
console.log('Local Project Team / RLS alignment applied through 133.');
