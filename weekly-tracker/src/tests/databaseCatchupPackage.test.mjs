import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPLICATION_COMMIT,
  buildCatchupPackage,
  migrationNumbersForTarget,
  removeTopLevelTransactionStatements,
  splitSqlStatements,
} from '../../../scripts/release/databaseCatchupPackage.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');

const lexicalFixture = `-- header\nBEGIN;\nDO $$ BEGIN RAISE NOTICE 'COMMIT;'; END $$;\nSELECT ';'::text;COMMIT;`;
const stripped = removeTopLevelTransactionStatements(lexicalFixture);
assert.deepEqual(stripped.removed, ['BEGIN', 'COMMIT']);
assert.match(stripped.sql, /RAISE NOTICE 'COMMIT;'/);
assert.equal(splitSqlStatements(stripped.sql).length, 2);

const production = buildCatchupPackage({ repoRoot, target: 'production' });
const staging = buildCatchupPackage({ repoRoot, target: 'staging' });
const localCertification = buildCatchupPackage({ repoRoot, target: 'production', preflightMode: 'local-certification' });

assert.equal(production.applicationCommit, APPLICATION_COMMIT);
assert.equal(production.migrations.length, 88);
assert.deepEqual(production.migrations.map(({ number }) => number), migrationNumbersForTarget('production'));
assert.equal(staging.migrations.length, 98);
assert.deepEqual(staging.migrations.map(({ number }) => number), migrationNumbersForTarget('staging'));
assert.equal(production.migrations[0].number, 59);
assert.equal(production.migrations.at(-1).number, 146);
assert.deepEqual(staging.migrations.slice(0, 10).map(({ number }) => number), [30,31,32,33,34,35,42,43,44,45]);
assert.ok(production.migrations.every(({ filename }) => !filename.endsWith('.test.sql')));
assert.doesNotMatch(production.sql, /030_snag_list_foundation\.sql/);
assert.match(staging.sql, /030_snag_list_foundation\.sql/);
assert.doesNotMatch(staging.sql, /OPENDAY_PREFLIGHT_STAGING_NOT_EMPTY/);
assert.match(staging.sql, /OPENDAY_PREFLIGHT_REFERENTIAL_INTEGRITY_FAILED/);
assert.match(staging.sql, /OPENDAY_PREFLIGHT_PROJECT_STATUS_REPAIR_REQUIRED/);
assert.match(production.sql, /059_reporting_evidence_provenance\.sql/);
assert.match(production.sql, /146_security_definer_execute_hardening\.sql/);
assert.match(production.sql, /OPENDAY_PREFLIGHT_SCHEMA_DRIFT/);
assert.doesNotMatch(localCertification.sql, /OPENDAY_PREFLIGHT_SCHEMA_DRIFT/);
assert.match(production.sql, /OPENDAY_PREFLIGHT_PROFILES_ROLE_CONSTRAINT_MISMATCH/);
assert.match(production.sql, /ALTER TABLE public\.profiles DROP CONSTRAINT profiles_role_check/);
assert.doesNotMatch(staging.sql, /OPENDAY_PREFLIGHT_PROFILES_ROLE_CONSTRAINT_MISMATCH/);
assert.ok(
  production.sql.indexOf('OPENDAY_PREFLIGHT_PROFILES_ROLE_CONSTRAINT_MISMATCH')
    < production.sql.indexOf('-- MIGRATION 119_project_team_access_foundation.sql'),
);
assert.match(localCertification.sql, /DROP CONSTRAINT IF EXISTS profiles_role_check/);
assert.match(production.sql, /OPENDAY_POSTFLIGHT_REQUIRED_OBJECT_MISSING/);
assert.match(production.sql, /OPENDAY_POSTFLIGHT_LEGACY_PROFILE_ROLE_CONTRACT_REMAINS/);
assert.match(production.sql, /supported-baseline-000-132/);
assert.doesNotMatch(production.sql, /register_schema_migration\('132_historical_commercial_data_foundation'/);
assert.match(production.sql, /register_schema_migration\('133_project_access_alignment'/);
assert.match(production.sql, /register_schema_migration\('146_security_definer_execute_hardening'/);
assert.deepEqual(
  [...staging.sql.matchAll(/SELECT private\.register_schema_migration\('(\d{3})_/g)].map((match) => Number(match[1])),
  Array.from({ length: 14 }, (_, index) => index + 133),
);
assert.match(production.sql, /profiles' AND column_name='job_role/);
assert.match(production.sql, /contractor_report_risk_work_groups/);
assert.doesNotMatch(production.sql, /^\\/m);
assert.match(production.sha256, /^[a-f0-9]{64}$/);

console.log('database catch-up release package: PASS');
