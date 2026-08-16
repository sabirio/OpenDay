import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
};
const sql = readFileSync(new URL('../migrations/069_project_boq_standard_custom_items.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/projectBoqService.js', import.meta.url), 'utf8');

console.log('\nprojectBoqStandardCustomItemsMigration - Phase C.13');
check('creates a stable per-BOQ line identity registry', /CREATE TABLE IF NOT EXISTS public\.project_boq_item_identities/.test(sql) && /PRIMARY KEY \(boq_id, line_id\)/.test(sql));
check('identity stores canonical Work Group and standard/custom kind', /work_group_id uuid NOT NULL/.test(sql) && /item_kind text NOT NULL/.test(sql));
check('standard/custom identity shape is database enforced', /item_kind = 'STANDARD'[\s\S]*standard_definition_id IS NOT NULL[\s\S]*item_kind = 'CUSTOM'[\s\S]*standard_definition_id IS NULL/.test(sql));
check('existing BOQ snapshots are backfilled before enforcement', /INSERT INTO public\.project_boq_item_identities[\s\S]*SELECT DISTINCT ON/.test(sql));
check('migration refuses pre-existing line identity drift', /PROJECT_BOQ_LINE_IDENTITY_HISTORY_CONFLICT/.test(sql));
check('new revisions cannot change a stable line classification', /PROJECT_BOQ_LINE_IDENTITY_IMMUTABLE/.test(sql));
check('standard rows must preserve ontology-controlled description and unit', /STANDARD_BOQ_METADATA_MISMATCH/.test(sql) && /standard_definition\.default_unit/.test(sql));
check('identity registry is immutable', /project_boq_item_identities_immutable/.test(sql) && /prevent_project_boq_snapshot_mutation/.test(sql));
check('registry uses project RLS and explicit read-only API grants', /ENABLE ROW LEVEL SECURITY/.test(sql) && /can_access_project\(project_id\)/.test(sql) && /GRANT SELECT ON TABLE public\.project_boq_item_identities TO authenticated/.test(sql));
check('private trigger is not callable by API roles', /REVOKE ALL ON FUNCTION private\.enforce_project_boq_item_identity\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(sql));
check('service exposes authorized identity reads', /loadProjectBoqItemIdentities/.test(service) && /from\('project_boq_item_identities'\)/.test(service));
check('does not grant contractor/bidder write access before Phase D', !/GRANT (INSERT|UPDATE|DELETE)/.test(sql));
check('does not implement C.14 Execution Scope mapping', !/execution_scope|executionScope/i.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
