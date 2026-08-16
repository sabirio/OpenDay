import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/113_boq_labour_material_pricing.sql', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const check = (label, condition) => { if (condition) { pass += 1; console.log(`  OK ${label}`); } else { fail += 1; console.error(`  FAIL ${label}`); } };

console.log('\nboqLabourMaterialPricingMigration');
check('project BOQ stores Labour and Material independently', /ALTER TABLE public\.project_boq_items[\s\S]*labour_rate[\s\S]*material_rate/.test(sql));
check('legacy unit rate remains the sum used by existing totals', /COALESCE\(\(item->>'labourRate'\)::numeric, 0\) \+ COALESCE\(\(item->>'materialRate'\)::numeric, 0\)/.test(sql));
check('tender draft and immutable submission preserve the breakdown', /project_tender_bid_draft_items[\s\S]*labour_rate[\s\S]*project_tender_bid_submission_items[\s\S]*material_rate/.test(sql));
check('bidder workspace returns current and previous component rates', /previousLabourRate/.test(sql) && /previousMaterialRate/.test(sql));
console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
