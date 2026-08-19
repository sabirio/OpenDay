import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  assertNoEmbeddedTransactions,
  normalizedSha256,
  removeTopLevelTransactionStatements,
  splitSqlStatements,
} from './databaseCatchupPackage.mjs';

const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/;

function loadMigration(repoRoot, number) {
  const migrationsDir = path.join(repoRoot, 'weekly-tracker', 'src', 'migrations');
  const prefix = `${String(number).padStart(3, '0')}_`;
  const matches = readdirSync(migrationsDir)
    .filter((name) => migrationPattern.test(name) && name.startsWith(prefix))
    .sort();
  if (matches.length !== 1) throw new Error(`Expected one migration for ${prefix}; found ${matches.join(', ') || 'none'}`);
  const filename = matches[0];
  const source = readFileSync(path.join(migrationsDir, filename), 'utf8').replace(/\r\n/g, '\n');
  const stripped = removeTopLevelTransactionStatements(source);
  assertNoEmbeddedTransactions(stripped.sql);
  return { number, filename, source, sql: stripped.sql, sha256: normalizedSha256(source) };
}

function functionContractSql(errorPrefix) {
  return `
  IF to_regprocedure('public.fn_audit_log()') IS NULL
     OR to_regprocedure('public.fn_set_updated_at()') IS NULL
     OR to_regprocedure('public.prevent_snag_event_mutation()') IS NULL
     OR to_regprocedure('public.prevent_scope_mutation_during_review()') IS NULL
     OR to_regprocedure('public.prevent_schedule_version_task_mutation()') IS NULL THEN
    RAISE EXCEPTION '${errorPrefix}_REQUIRED_FUNCTION_MISSING';
  END IF;`;
}

export function buildSecurity147Package({ repoRoot, target }) {
  if (target !== 'staging' && target !== 'production') throw new Error(`Unsupported target: ${target}`);
  const projectRef = target === 'staging' ? STAGING_PROJECT_REF : PRODUCTION_PROJECT_REF;
  const previous = loadMigration(repoRoot, 146);
  const migration = loadMigration(repoRoot, 147);
  const migrationId = migration.filename.replace(/\.sql$/, '');
  const previousId = previous.filename.replace(/\.sql$/, '');

  const sql = `-- AUTO-GENERATED. DO NOT EDIT.

-- OpenDay ${target} security package

-- Package: security-147

-- Approved Supabase project ref: ${projectRef}

-- Migration count: 1

BEGIN;

SET LOCAL lock_timeout = '10s';

SET LOCAL statement_timeout = '10min';

DO $openday_security_147_preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_REQUIRES_POSTGRES';
  END IF;
  IF to_regclass('public.schema_migration_ledger') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_LEDGER_MISSING';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='${previousId}'
       AND sequence_number=146
       AND filename='${previous.filename}'
       AND sha256='${previous.sha256}'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_PREVIOUS_MIGRATION_MISMATCH';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='${migrationId}' OR sequence_number=147
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
${functionContractSql('OPENDAY_SECURITY_147_PREFLIGHT')}
END
$openday_security_147_preflight$;

-- MIGRATION ${migration.filename} SHA256 ${migration.sha256}
${migration.sql}

SELECT private.register_schema_migration('${migrationId}', 147, '${migration.filename}', '${migration.sha256}');

DO $openday_security_147_postflight$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='${migrationId}'
       AND sequence_number=147
       AND filename='${migration.filename}'
       AND sha256='${migration.sha256}'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_SECURITY_147_LEDGER_MISMATCH';
  END IF;
${functionContractSql('OPENDAY_SECURITY_147_POSTFLIGHT')}
END
$openday_security_147_postflight$;

COMMIT;
`;

  const transactionControls = splitSqlStatements(sql)
    .map((statement) => statement.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\r\n]*/g, '').trim())
    .filter((statement) => /^(?:BEGIN|COMMIT|ROLLBACK)\s*;?$/i.test(statement));
  if (transactionControls.length !== 2 || !/^BEGIN/i.test(transactionControls[0]) || !/^COMMIT/i.test(transactionControls[1])) {
    throw new Error(`Security release must contain one outer BEGIN/COMMIT pair; found ${transactionControls.join(', ')}`);
  }

  return { target, projectRef, migration, sql, sha256: normalizedSha256(sql) };
}
