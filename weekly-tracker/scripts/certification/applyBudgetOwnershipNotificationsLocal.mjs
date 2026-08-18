// Local-only Budget ownership and notifications extension through roadmap E.26.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(dir, '..', '..', 'src', 'migrations', '081_budget_ownership_notifications.sql');
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'e18c13d23e6d60fc0679883cb36dfb761ba5881ec8ba859b1531178cebe0bb42';
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 081 hash mismatch');
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` } });
console.log('Local Budget ownership and notifications applied through 081.');
