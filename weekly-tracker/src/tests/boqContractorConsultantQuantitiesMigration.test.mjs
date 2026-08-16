import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (label, condition) => { if (condition) { pass += 1; console.log(`  OK ${label}`); } else { fail += 1; console.error(`  FAIL ${label}`); } };
const sql = readFileSync(new URL('../migrations/114_boq_contractor_consultant_quantities.sql', import.meta.url), 'utf8');

console.log('\nboqContractorConsultantQuantitiesMigration');
check('immutable BOQ items store a nullable consultant quantity', /ADD COLUMN IF NOT EXISTS consultant_quantity numeric\(20,6\)/.test(sql));
check('consultant quantity cannot be negative', /consultant_quantity IS NULL OR consultant_quantity >= 0/.test(sql));
check('revision payload is copied through a private insert trigger', /project_boq_items_apply_consultant_quantity/.test(sql) && /item->>'consultantQuantity'/.test(sql));
check('trigger function is not exposed through the Data API roles', /REVOKE ALL ON FUNCTION private\.apply_project_boq_consultant_quantity\(\)/.test(sql));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
