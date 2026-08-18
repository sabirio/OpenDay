import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureIntegrityMigrations } from './architectureIntegrityMigrations.mjs';
import { LOCAL_DB_URL as DB_URL } from './localDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const tests = [
  path.join(root, 'scripts', 'certification', 'sql', '133_project_access_alignment.test.sql'),
  ...architectureIntegrityMigrations.slice(1).map(([filename]) =>
    path.join(root, 'src', 'migrations', filename.replace(/\.sql$/, '.test.sql'))),
];
const env = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };
for (const file of tests) {
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env });
}
console.log('Architecture integrity database certification passed through 143.');
