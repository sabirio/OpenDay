import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => { if (condition) { pass += 1; console.log(`  OK ${label}`); } else { fail += 1; console.error(`  FAIL ${label}`); } };
const sql = readFileSync(new URL('../migrations/115_boq_optional_contractor_quantity.sql', import.meta.url), 'utf8');

console.log('\nboqOptionalContractorQuantityMigration');
check('contractor quantity becomes nullable', /ALTER COLUMN quantity DROP NOT NULL/.test(sql));
check('missing quantity is restored to null after legacy validation', /project_boq_items_apply_optional_contractor_quantity/.test(sql) && /NEW\.quantity := NULLIF\(v_item->>'quantity', ''\)::numeric/.test(sql));
check('provided contractor quantity must remain greater than zero', /INVALID_CONTRACTOR_QUANTITY/.test(sql) && /::numeric <= 0/.test(sql));
check('public save contract remains restricted to authenticated users', /GRANT EXECUTE ON FUNCTION public\.save_project_boq_revision[\s\S]*TO authenticated/.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
