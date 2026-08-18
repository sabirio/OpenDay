import { execFileSync } from 'node:child_process';
import { assertLocalTarget } from './localTargetGuard.mjs';

export const LOCAL_API_URL = process.env.CERT_SUPABASE_URL || 'http://127.0.0.1:54321';
export const LOCAL_DB_URL = process.env.CERT_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

assertLocalTarget({
  apiUrl: LOCAL_API_URL,
  dbUrl: LOCAL_DB_URL,
  enabled: '1',
  projectId: 'weekly-tracker',
});

const psqlEnv = { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}` };

function queryScalar(dbUrl, sql) {
  return execFileSync('psql', [dbUrl, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    env: psqlEnv,
  }).trim();
}

export function shouldApplyRegisteredMigration({ dbUrl = LOCAL_DB_URL, migrationId, sha256 }) {
  if (!/^[a-z0-9_]+$/.test(migrationId) || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('REFUSING LOCAL DEPLOY: invalid migration identity');
  }
  const ledgerExists = queryScalar(dbUrl, "select to_regclass('public.schema_migration_ledger') is not null;") === 't';
  if (!ledgerExists) return true;
  const registered = queryScalar(dbUrl, `select coalesce((select sha256 from public.schema_migration_ledger where migration_id = '${migrationId}'), '');`);
  if (!registered) return true;
  if (registered !== sha256) throw new Error(`REFUSING LOCAL DEPLOY: ${migrationId} ledger hash mismatch`);
  return false;
}
