// Local-only Gantt Baseline Scope Snapshot extension.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', '065_gantt_baseline_scope_snapshot.sql');
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'eb46be0ef81436b2f45d9a5fa15e143c9e788ed4f36da3dae0eee4eb4396dfa0';
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('REFUSING LOCAL DEPLOY: 065 hash mismatch');
}
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
  stdio: 'inherit',
  env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
});
console.log('Local Gantt Baseline Scope Snapshot applied through 065.');
