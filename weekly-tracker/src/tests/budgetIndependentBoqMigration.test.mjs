import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const sql = readFileSync(new URL('../migrations/112_budget_independent_boq.sql', import.meta.url), 'utf8');
const check = (label, condition) => { if (condition) { pass += 1; console.log(`  OK ${label}`); } else { fail += 1; console.error(`  FAIL ${label}`); } };

console.log('\nbudgetIndependentBoqMigration');
check('budget activation command is removed', /DROP FUNCTION IF EXISTS public\.activate_project_boq_unbudgeted_work_group/.test(sql));
check('budget classification table is removed', /DROP TABLE IF EXISTS public\.project_boq_unbudgeted_work_groups/.test(sql));
check('obsolete immutable trigger function is removed', /DROP FUNCTION IF EXISTS private\.prevent_project_boq_scope_activation_mutation/.test(sql));
check('migration does not touch standard BOQ definitions', !/DROP TABLE IF EXISTS public\.work_ontology_boq_item_definitions/.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
