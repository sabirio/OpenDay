// Local-only, hash-pinned upgrade from the supported migration-132 baseline.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureIntegrityMigrations } from './architectureIntegrityMigrations.mjs';
import { LOCAL_API_URL, LOCAL_DB_URL as DB_URL, shouldApplyRegisteredMigration } from './localDbTarget.mjs';
import { assertLocalTarget } from './localTargetGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', '..', 'src', 'migrations');
const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };

assertLocalTarget({
  apiUrl: LOCAL_API_URL,
  dbUrl: DB_URL,
  enabled: '1',
  projectId: 'weekly-tracker',
});

const appliedMigrations = [];
for (const [filename, expected] of architectureIntegrityMigrations) {
  const file = path.join(migrationsDir, filename);
  const bytes = Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`REFUSING LOCAL DEPLOY: ${filename} hash mismatch`);
  const migrationId = filename.replace(/\.sql$/, '');
  if (!shouldApplyRegisteredMigration({ dbUrl: DB_URL, migrationId, sha256: expected })) {
    console.log(`SKIP ${filename}: already registered with matching SHA-256.`);
    continue;
  }
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit', env: psqlEnv });
  appliedMigrations.push([filename, expected]);
}

for (const [filename, sha256] of appliedMigrations) {
  const sequence = Number(filename.slice(0, 3));
  const migrationId = filename.replace(/\.sql$/, '');
  const statement = `select private.register_schema_migration('${migrationId}', ${sequence}, '${filename}', '${sha256}');`;
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-c', statement], { stdio: 'inherit', env: psqlEnv });
}
console.log(appliedMigrations.length
  ? 'Architecture integrity corrections applied and registered through 143.'
  : 'Architecture integrity corrections already registered through 143; no SQL reapplied.');
