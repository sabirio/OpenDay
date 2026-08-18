import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/128_bid_scope_adjustments_and_comparison.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.error(`  FAIL ${name}`); }
};

check('bid lines record issued or contractor-added origin', /line_origin text NOT NULL DEFAULT 'ISSUED'/.test(sql) && /CONTRACTOR_ADDED/.test(sql));
check('bid lines record included or excluded action', /line_action text NOT NULL DEFAULT 'INCLUDED'/.test(sql) && /'EXCLUDED'/.test(sql));
check('issued scope remains complete and canonical', /BID_SCOPE_MISMATCH/.test(sql) && /source\.description ELSE btrim\(item->>'description'\)/.test(sql));
check('contractor-added lines stay inside tender scope', /INVALID_CONTRACTOR_ADDED_LINE/.test(sql) && /project_tender_scope_work_groups/.test(sql));
check('excluded lines cannot contribute prices or quantities', /lineAction','INCLUDED'\)='EXCLUDED' THEN NULL/.test(sql));
check('new rounds inherit prior contractor-added lines', /added\.line_origin='CONTRACTOR_ADDED'/.test(sql) && /v_previous_submission_id/.test(sql));
check('comparison exposes quantity and line evidence', /'contractorQuantity'/.test(sql) && /'consultantQuantity'/.test(sql) && /'LINE_ADDED'/.test(sql) && /'LINE_REMOVED'/.test(sql));
check('historical immutable submission rows are not rewritten', !/DISABLE TRIGGER project_tender_bid_submission_items_immutable/.test(sql) && !/UPDATE public\.project_tender_bid_submission_items/.test(sql));

console.log(`\nTender bid scope adjustments migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
