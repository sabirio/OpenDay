// Local-only clean deploy for database certification.
// Run normally for reset + deploy, or with --deploy-only after a reset has
// already completed. The canonical security contract is the migration source
// of truth, so this harness cannot silently lag behind new migrations.

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_URL } from './env.mjs';
import { assertLocalTarget } from './localTargetGuard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const weeklyTrackerDir = path.resolve(__dirname, '..', '..');
const migrationsDir = path.resolve(weeklyTrackerDir, 'src', 'migrations');
const contractPath = path.resolve(weeklyTrackerDir, '..', 'scripts', 'contracts', 'canonical-security-contract.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const freshPath = contract.canonicalMigrationPath?.included;
assertLocalTarget({ apiUrl: process.env.CERT_SUPABASE_URL, dbUrl: DB_URL, enabled: process.env.LOCAL_FIXTURE_MODE, projectId: process.env.LOCAL_SUPABASE_PROJECT_ID });

if (!Array.isArray(freshPath) || freshPath.length === 0) {
  throw new Error(`Canonical migration path is missing or empty: ${contractPath}`);
}

function psqlFile(file) {
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    stdio: 'pipe',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
    cwd: migrationsDir,
  });
}

function resetLocalDatabase() {
  try {
    execSync('npx --yes supabase db reset', { cwd: weeklyTrackerDir, stdio: 'inherit' });
  } catch {
    // The local CLI can finish recreating Postgres before dependent local
    // containers (notably Storage/Realtime) become healthy. Reconcile the
    // whole proved-local stack once, then retry the same reset. A persistent
    // schema/reset error still fails closed on the second attempt.
    console.warn('Local reset health check failed; restarting the proved-local Supabase stack once before retrying...');
    execSync('npx --yes supabase stop', { cwd: weeklyTrackerDir, stdio: 'inherit' });
    execSync('npx --yes supabase start', { cwd: weeklyTrackerDir, stdio: 'inherit' });
    execSync('npx --yes supabase db reset', { cwd: weeklyTrackerDir, stdio: 'inherit' });
  }
}

function main() {
  const deployOnly = process.argv.includes('--deploy-only');
  if (deployOnly) {
    console.log('1/2 reset skipped (--deploy-only); using the existing local database...');
  } else {
    console.log('1/2 supabase db reset (truncates public schema back to empty)...');
    resetLocalDatabase();
  }

  console.log(`\n2/2 applying ${freshPath.length} canonical fresh-path migrations...`);
  const present = new Set(readdirSync(migrationsDir));
  for (const file of freshPath) {
    if (!present.has(file)) throw new Error(`Expected migration file missing: ${file}`);
    process.stdout.write(`  ${file} ... `);
    psqlFile(file);
    console.log('OK');
  }
  console.log(`\nClean deploy complete: canonical path through ${freshPath.at(-1)} applied.`);
}

try {
  main();
} catch (err) {
  console.error('\nCLEAN DEPLOY FAILED — one of the requested local steps did not complete:');
  console.error('  1. optional supabase db reset (Docker/Supabase CLI must be running)');
  console.error('  2. applying the canonical fresh-path migration chain');
  console.error(`\n${err.stdout ? err.stdout.toString() : ''}${err.stderr ? err.stderr.toString() : err.message}\n`);
  process.exit(1);
}
