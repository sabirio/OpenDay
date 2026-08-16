import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const migration = readFileSync(new URL('../migrations/067_project_boq_foundation.sql', import.meta.url), 'utf8');

console.log('\nprojectBoqFoundationMigration - Phase C.11');
check('separates BOQ root, immutable revisions and line snapshots', /CREATE TABLE IF NOT EXISTS public\.project_boqs/.test(migration) && /CREATE TABLE IF NOT EXISTS public\.project_boq_versions/.test(migration) && /CREATE TABLE IF NOT EXISTS public\.project_boq_items/.test(migration));
check('pins every BOQ to project Work Ontology', /ontology_version_id uuid NOT NULL REFERENCES public\.work_ontology_versions/.test(migration));
check('versions are numbered and append-only', /UNIQUE \(boq_id, revision_number\)/.test(migration) && /PROJECT_BOQ_SNAPSHOT_IMMUTABLE/.test(migration));
check('lines retain stable identity across revisions', /line_id uuid NOT NULL/.test(migration) && /PRIMARY KEY \(boq_version_id, line_id\)/.test(migration));
check('line stores roadmap commercial fields', /description text NOT NULL/.test(migration) && /unit text NOT NULL/.test(migration) && /quantity numeric/.test(migration) && /unit_rate numeric/.test(migration) && /contractor_note text/.test(migration) && /specification text/.test(migration));
check('Total is database-generated from Quantity x Unit Rate', /line_total numeric\(24,2\) GENERATED ALWAYS AS \(round\(quantity \* unit_rate, 2\)\) STORED/.test(migration));
check('standard definition cannot be silently remapped to another Work Group', /FOREIGN KEY \(ontology_version_id, standard_definition_id, work_group_id\)/.test(migration));
check('schema represents standard/custom identity without implementing editor workflow', /item_kind IN \('STANDARD', 'CUSTOM'\)/.test(migration) && /project_boq_items_kind_shape_check/.test(migration));
check('revision command is optimistic and idempotent', /BOQ_REVISION_CONFLICT/.test(migration) && /boq\.save_revision/.test(migration) && /idempotentReplay/.test(migration));
check('write command is explicitly PM/Admin and project scoped', /v_role NOT IN \('pm', 'admin'\)/.test(migration) && /can_write_project\(p_project_id\)/.test(migration));
check('new tables use project RLS and authenticated read-only grants', (migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length === 3 && /can_access_project\(project_id\)/.test(migration) && /GRANT SELECT ON TABLE/.test(migration) && !/GRANT (INSERT|UPDATE|DELETE) ON TABLE/.test(migration));
check('privileged RPC and sequence are explicitly restricted', /REVOKE ALL ON FUNCTION public\.save_project_boq_revision[\s\S]+FROM PUBLIC, anon, authenticated, service_role/.test(migration) && /REVOKE ALL ON SEQUENCE public\.project_boq_versions_id_seq/.test(migration));
check('does not implement later aggregation or Execution Scope mapping', !/project_execution_scope/.test(migration) && !/GROUP BY[^;]+work_group_id/i.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
