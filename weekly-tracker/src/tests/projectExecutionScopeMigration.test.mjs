import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/063_project_execution_scope_foundation.sql', import.meta.url), 'utf8');

console.log('\nprojectExecutionScopeMigration - Phase B.7 foundation');
check('stores immutable version headers and normalized Work Group items',
  /CREATE TABLE IF NOT EXISTS public\.project_execution_scope_versions/.test(migration)
  && /CREATE TABLE IF NOT EXISTS public\.project_execution_scope_items/.test(migration)
  && /UNIQUE \(project_id, revision_number\)/.test(migration)
  && /PRIMARY KEY \(execution_scope_version_id, work_group_id\)/.test(migration));
check('pins every item to one ontology, Discipline, and Work Group tuple',
  /FOREIGN KEY \(ontology_version_id, discipline_id, work_group_id\)/.test(migration)
  && /work_ontology_work_groups\(ontology_version_id, discipline_id, id\)/.test(migration));
check('derives Work Groups from validated PM Discipline UUIDs',
  /jsonb_array_elements_text\(NEW\.scope->'disciplineIds'\)/.test(migration)
  && /work_group\.discipline_id = ANY\(selected_discipline_ids\)/.test(migration));
check('creates a new revision only when the canonical source fingerprint changes',
  /ORDER BY version\.revision_number DESC/.test(migration)
  && /latest_fingerprint IS NOT DISTINCT FROM source_fingerprint/.test(migration)
  && /COALESCE\(max\(version\.revision_number\), 0\) \+ 1/.test(migration));
check('does not backfill historical projects',
  !/INSERT INTO public\.project_execution_scope_versions[\s\S]+FROM public\.projects/i.test(migration));
check('does not materialize or mutate Gantt activities',
  !/project_gantt_tasks/.test(migration));
check('uses an internal trigger function rather than a public RPC',
  /CREATE SCHEMA IF NOT EXISTS private/.test(migration)
  && /FUNCTION private\.sync_project_execution_scope_from_disciplines/.test(migration)
  && /REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role/.test(migration));
check('protects both exposed tables with project-authorized RLS',
  (migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 2
  && /public\.can_access_project\(project_id\)/.test(migration)
  && /public\.can_access_project\(version\.project_id\)/.test(migration));
check('exposes authenticated read-only access explicitly',
  (migration.match(/REVOKE ALL ON TABLE public\.project_execution_scope_/g) || []).length === 2
  && (migration.match(/GRANT SELECT ON TABLE public\.project_execution_scope_/g) || []).length === 2
  && !/GRANT (INSERT|UPDATE|DELETE)/.test(migration));
check('internal identity sequence is not exposed through default privileges',
  /REVOKE ALL ON SEQUENCE public\.project_execution_scope_versions_id_seq[\s\S]+FROM PUBLIC, anon, authenticated, service_role/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
