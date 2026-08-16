import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/061_project_work_ontology_scope.sql', import.meta.url), 'utf8');

console.log('\nprojectWorkOntologyScopeMigration - project pinning contract');
check('adds no destructive project backfill', !/UPDATE\s+public\.projects/i.test(migration) && !/DELETE\s+FROM\s+public\.projects/i.test(migration));
check('validates and pins before project insertion',
  /BEFORE INSERT OR UPDATE OF scope, work_ontology_version_id ON public\.projects/.test(migration)
  && /NEW\.work_ontology_version_id := requested_version_id/.test(migration));
check('requires a published active owner-visible ontology version',
  /version\.status = 'PUBLISHED'/.test(migration)
  && /version\.is_active = true/.test(migration)
  && /version\.company_id IS NULL OR version\.company_id IS NOT DISTINCT FROM NEW\.company_id/.test(migration));
check('requires one or more unique discipline UUIDs',
  /jsonb_typeof\(NEW\.scope->'disciplineIds'\)/.test(migration)
  && /requested_discipline_count = 0/.test(migration)
  && /count\(DISTINCT value\)/.test(migration));
check('accepts only scope-selectable disciplines from the pinned version',
  /discipline\.ontology_version_id = requested_version_id/.test(migration)
  && /discipline\.scope_selectable = true/.test(migration));
check('prevents version replacement and metadata removal',
  /PROJECT_WORK_ONTOLOGY_VERSION_IMMUTABLE/.test(migration)
  && /ontology metadata cannot be removed/.test(migration));
check('trigger helper is unavailable to API and service roles',
  /REVOKE ALL ON FUNCTION public\.validate_and_pin_project_work_ontology\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
