import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

// Durable guard from docs/PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md:
// "every migration that creates a new table, sequence, or function in
// schema public must explicitly close its own ACL contract in the same
// migration file." That doc's own regression coverage
// (scripts/tests/production-remediation.tests.ps1) only checks specific,
// already-known historical migrations (025/027/028) - it cannot catch a
// brand-new migration that skips the guard. This file is the generic,
// forward-looking version of that check.
//
// Migrations 000-057 are historically grandfathered: whatever ACL debt they
// individually carried has either been closed by a later migration
// (026/028/055/056/057) or is tracked separately (Gate 13C's Parts 1-3
// classification, Simplification Phase 3E.4/3E.5). Re-litigating that
// history object-by-object here would either be redundant with those
// already-existing checks or fail against migrations nobody is proposing to
// change. This guard's only job is to stop the SAME class of gap from
// recurring in any migration numbered 058 or higher.
const GRANDFATHERED_THROUGH = 57;

function migrationNumber(filename) {
  const m = filename.match(/^(\d{3})_/);
  return m ? Number(m[1]) : null;
}

function stripComments(text) {
  return text.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
}

// Pure detector, independently unit-tested below against synthetic fixtures
// before being trusted against real migration files - guards against this
// whole check being vacuously true (no real migration currently exceeds
// GRANDFATHERED_THROUGH, so without a synthetic fixture this file could
// pass with zero real assertions ever having exercised the detection logic).
function findAclNormalizationGaps(migrationText) {
  const activeLines = stripComments(migrationText);
  const gaps = [];

  const newTables = [...activeLines.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?(\w+)/gi)].map(m => m[1]);
  const newSequences = [...activeLines.matchAll(/CREATE SEQUENCE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?(\w+)/gi)].map(m => m[1]);
  const newFunctions = [...activeLines.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+(?:public\.)?(\w+)/gi)].map(m => m[1]);

  // bigserial/serial columns create an implicit sequence
  // (<table>_<column>_seq) with no separate CREATE SEQUENCE statement.
  const implicitSequenceTables = [...activeLines.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)]
    .flatMap(tableMatch => {
      const [, tableName, body] = tableMatch;
      const serialCols = [...body.matchAll(/^\s*(\w+)\s+(?:big)?serial\b/gim)].map(m => m[1]);
      return serialCols.map(col => `${tableName}_${col}_seq`);
    });

  // ACL object lists are often intentionally grouped into one multiline
  // statement. Inspect complete SQL statements instead of using an arbitrary
  // character distance, which rejects longer but still explicit lists.
  const statements = activeLines.split(';');
  const aclCoversObject = (objectName) => statements.some(statement =>
    /\b(?:REVOKE|GRANT)\b/i.test(statement)
      && new RegExp(`\\b${objectName}\\b`, 'i').test(statement));

  for (const name of newTables) {
    if (!aclCoversObject(name)) gaps.push({ type: 'table', name });
  }
  for (const name of newSequences) {
    if (!aclCoversObject(name)) gaps.push({ type: 'sequence', name });
  }
  for (const name of implicitSequenceTables) {
    if (!aclCoversObject(name)) gaps.push({ type: 'implicit-sequence', name });
  }
  for (const name of newFunctions) {
    if (!aclCoversObject(name)) gaps.push({ type: 'function', name });
  }

  return gaps;
}

console.log('\naclNormalizationGuard - detector self-test against synthetic fixtures');

const syntheticBadTable = `
CREATE TABLE public.widgets (
  id bigserial PRIMARY KEY,
  name text
);
`;
check('detector flags a new table with no ACL statement in the same migration (synthetic bad fixture)',
  findAclNormalizationGaps(syntheticBadTable).some(g => g.type === 'table' && g.name === 'widgets'));
check('detector flags the implicit bigserial-backed sequence too (synthetic bad fixture)',
  findAclNormalizationGaps(syntheticBadTable).some(g => g.type === 'implicit-sequence' && g.name === 'widgets_id_seq'));

const syntheticGoodTable = `
CREATE TABLE public.widgets (
  id bigserial PRIMARY KEY,
  name text
);
REVOKE ALL ON public.widgets FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.widgets TO authenticated;
REVOKE ALL ON SEQUENCE public.widgets_id_seq FROM PUBLIC, anon;
GRANT USAGE ON SEQUENCE public.widgets_id_seq TO authenticated;
`;
check('detector reports zero gaps when the same migration self-closes both the table and its implicit sequence (synthetic good fixture)',
  findAclNormalizationGaps(syntheticGoodTable).length === 0);

const syntheticBadFunction = `
CREATE OR REPLACE FUNCTION public.do_thing(p_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END;
$$;
`;
check('detector flags a new/replaced function with no ACL statement in the same migration (synthetic bad fixture)',
  findAclNormalizationGaps(syntheticBadFunction).some(g => g.type === 'function' && g.name === 'do_thing'));

const syntheticCommentOnlyMention = `
-- this migration does not create public.widgets, it only mentions it in a
-- comment: REVOKE ALL ON public.widgets FROM PUBLIC;
CREATE TABLE public.widgets (
  id bigserial PRIMARY KEY
);
`;
check('detector does not count an ACL statement that only appears inside a comment (synthetic fixture)',
  findAclNormalizationGaps(syntheticCommentOnlyMention).some(g => g.type === 'table' && g.name === 'widgets'));

console.log(`\naclNormalizationGuard - real migrations numbered ${GRANDFATHERED_THROUGH + 1}+ (forward-enforced; 000-${GRANDFATHERED_THROUGH} are historically grandfathered)`);

const migrationsDir = new URL('../migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const enforcedFiles = migrationFiles.filter(f => {
  const num = migrationNumber(f);
  return num !== null && num > GRANDFATHERED_THROUGH;
});

if (enforcedFiles.length === 0) {
  console.log(`  (none yet - highest migration is <= ${GRANDFATHERED_THROUGH}; this section activates automatically once 058+ exists)`);
}

for (const file of enforcedFiles) {
  const text = readFileSync(new URL(file, migrationsDir), 'utf8');
  const gaps = findAclNormalizationGaps(text);
  check(`${file}: every new table/sequence/function self-closes its own ACL in the same migration`, gaps.length === 0);
  if (gaps.length > 0) {
    for (const gap of gaps) console.error(`    MISSING ACL: ${gap.type} ${gap.name}`);
  }
}

console.log(`\n-- aclNormalizationGuard: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
