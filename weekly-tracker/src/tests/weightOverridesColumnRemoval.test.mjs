// weightOverridesColumnRemoval.test.mjs - F-05 contract: dead
// projects.weight_overrides column has zero code consumers and its removal
// migration is idempotent. Migration is NOT applied automatically — this
// only asserts the file's own content, matching the existing
// rlsProjectsSelfReferenceFix.test.mjs / rlsMultiTenant.test.mjs pattern.
// The zero-consumer scan uses a pure-JS directory walk (matching
// architectureGuard.test.mjs's established pattern), not a shell grep.
// Run: node src/tests/weightOverridesColumnRemoval.test.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const srcRoot    = path.resolve(__dirname, '..'); // weekly-tracker/src/

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const migration = readFileSync(path.join(srcRoot, 'migrations/024_drop_dead_weight_overrides_column.sql'), 'utf8');

console.log('\nweightOverridesColumnRemoval - F-05 contract');

check('migration drops the correct column, idempotently (IF EXISTS)',
  /ALTER TABLE projects\s+DROP COLUMN IF EXISTS weight_overrides;/.test(migration));
check('migration is pure DDL — no function/trigger that could auto-apply it outside a manual run',
  !/CREATE OR REPLACE FUNCTION/.test(migration));

// Zero-consumer proof, re-verified live on every test run (not just asserted
// once at audit time) — fails loudly if a future commit ever adds a real
// reader/writer of this column, which would mean this migration should NOT
// be run against a database anymore.
const allFiles = walk(srcRoot);
const hits = [];
for (const file of allFiles) {
  const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  if (text.includes('weight_overrides')) hits.push(rel);
}

const EXPECTED_HITS = new Set([
  'migrations/000_baseline.sql',                        // the original ADD COLUMN
  'migrations/024_drop_dead_weight_overrides_column.sql', // this removal migration
  'tests/weightOverridesColumnRemoval.test.mjs',          // this assertion file itself
]);
check('the ONLY files referencing weight_overrides (snake_case) anywhere in src/ are 000_baseline.sql, this removal migration (024), and this test itself — zero application-code consumers',
  hits.length === EXPECTED_HITS.size && hits.every(h => EXPECTED_HITS.has(h)));
// Sanity: prove the live camelCase mechanism (scope.weightOverrides) has
// real, non-doc/non-migration application-code consumers — this migration
// must never be mistaken for touching that separate, live column.
const weightOverridesCamelCaseAppFiles = allFiles
  .filter(f => readFileSync(f, 'utf8').includes('weightOverrides'))
  .map(f => path.relative(srcRoot, f).replace(/\\/g, '/'))
  .filter(rel => !rel.startsWith('migrations/') && !rel.startsWith('tests/') && !rel.endsWith('.md'));
check('scope.weightOverrides (camelCase, the real/live JSONB mechanism) has real application-code consumers, confirming it is a genuinely separate, untouched column',
  weightOverridesCamelCaseAppFiles.length > 0);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
