import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSecurity148Package } from '../../../scripts/release/security148Package.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const staging = buildSecurity148Package({ repoRoot, target: 'staging' });
const production = buildSecurity148Package({ repoRoot, target: 'production' });

assert.equal(staging.migration.number, 148);
assert.match(staging.sql, /OpenDay staging security package/);
assert.match(production.sql, /OpenDay production security package/);
assert.match(staging.sql, /OPENDAY_SECURITY_148_PREVIOUS_MIGRATION_MISMATCH/);
assert.match(staging.sql, /148_authenticated_security_definer_boundary/);
assert.match(staging.sql, /REVOKE ALL ON FUNCTION[\s\S]*public\.next_snag_number\(bigint\)/);
assert.match(staging.sql, /get_contractor_schedule_lifecycle_status/);
assert.match(staging.sha256, /^[a-f0-9]{64}$/);
assert.notEqual(staging.sha256, production.sha256);

console.log('security 148 release package: PASS');
