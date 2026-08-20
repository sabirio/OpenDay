import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_DB_URL } from './localDbTarget.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const testFile = path.resolve(dirname, '..', '..', 'src', 'migrations', '157_business_development_estimate_foundation.test.sql');
execFileSync('psql', [LOCAL_DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', testFile], {
  stdio: 'inherit', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` },
});
console.log('Business Development Estimate Foundation certification passed through 157.');
