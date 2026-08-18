// Local-only collaborative departmental Budget extension through roadmap E.25.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(dir, '..', '..', 'src', 'migrations', '080_collaborative_departmental_budget.sql');
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'df24aca5ac025b58ec7d786b4be26171fa1694ec3adcafb2d517ad7daa913504';
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 080 hash mismatch');
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` } });
console.log('Local collaborative departmental Budget applied through 080.');
