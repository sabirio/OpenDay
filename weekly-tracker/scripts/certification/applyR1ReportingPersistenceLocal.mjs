// Local-only R1.1 extension. It deliberately runs after the existing 053-058
// certified chain; R1.1 is not silently added to the historical fresh path.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, '..', '..', 'src', 'migrations', '059_reporting_evidence_provenance.sql');
const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
const expected = 'c16fe9b0cd93d8f2ee3cded4557fc75be6140dc4ccc3b8a36f92b45f27bed05a';
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('REFUSING LOCAL DEPLOY: 059 hash mismatch');
execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
  stdio: 'inherit',
  env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
});
console.log('Local R1.1 reporting persistence extension applied through 059.');
