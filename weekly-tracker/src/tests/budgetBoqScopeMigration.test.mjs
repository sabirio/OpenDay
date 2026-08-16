import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const sql = readFileSync(new URL('../migrations/111_budget_boq_scope_and_standard_details.sql', import.meta.url), 'utf8');
const check = (label, condition) => { if (condition) { pass += 1; console.log(`  OK ${label}`); } else { fail += 1; console.error(`  FAIL ${label}`); } };

console.log('\nbudgetBoqScopeMigration');
check('catalog completion creates four standard details for empty active groups', /generate_series\(1,4\)/.test(sql) && /work_ontology_boq_item_definitions/.test(sql));
check('published ontology immutability is restored after controlled completion', /DISABLE TRIGGER work_ontology_boq_definitions_immutable[\s\S]*ENABLE TRIGGER work_ontology_boq_definitions_immutable/.test(sql));
check('unbudgeted activation is append-only and reasoned', /project_boq_unbudgeted_work_groups/.test(sql) && /reason_code/.test(sql) && /explanation/.test(sql) && /IMMUTABLE/.test(sql));
check('only a budget Not Applicable Work Group can be activated', /project_budget_contributions[\s\S]*c\.amount IS NULL/.test(sql));
check('table uses explicit RLS and read grant', /ENABLE ROW LEVEL SECURITY/.test(sql) && /GRANT SELECT ON TABLE public\.project_boq_unbudgeted_work_groups TO authenticated/.test(sql));
check('write is exposed only by an authenticated RPC', /REVOKE ALL ON FUNCTION public\.activate_project_boq_unbudgeted_work_group/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.activate_project_boq_unbudgeted_work_group[\s\S]*TO authenticated/.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
