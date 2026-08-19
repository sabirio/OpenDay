import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSecurity147Package } from '../../../scripts/release/security147Package.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const staging = buildSecurity147Package({ repoRoot, target: 'staging' });
const production = buildSecurity147Package({ repoRoot, target: 'production' });

assert.equal(staging.migration.number, 147);
assert.match(staging.sql, /OpenDay staging security package/);
assert.match(production.sql, /OpenDay production security package/);
assert.match(staging.sql, /OPENDAY_SECURITY_147_PREVIOUS_MIGRATION_MISMATCH/);
assert.match(staging.sql, /147_security_advisor_hardening/);
assert.match(staging.sql, /REVOKE ALL ON FUNCTION public\.fn_audit_log\(\)/);
assert.match(staging.sql, /SET search_path = pg_catalog, public/);
assert.match(staging.sha256, /^[a-f0-9]{64}$/);
assert.notEqual(staging.sha256, production.sha256);

console.log('security 147 release package: PASS');
