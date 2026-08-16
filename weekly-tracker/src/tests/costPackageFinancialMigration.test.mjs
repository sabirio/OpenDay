import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/131_cost_package_financial_foundation.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  PASS ${name}`); }
  else { failed += 1; console.error(`  FAIL ${name}`); }
};

check('Additional Works receive Cost Package and contractor identity', /ADD COLUMN IF NOT EXISTS cost_package_id uuid/.test(sql) && /assign_variation_commercial_identity/.test(sql) && /contractor_name/.test(sql));
check('universal commitment sources are modeled', ['TENDER_AWARD','FRAMEWORK_CALLOFF','DIRECT_AWARD','EXISTING_CONTRACT','NOMINATED_SUPPLIER'].every(value => sql.includes(value)));
check('Tender Award creates a commitment from Commercial Baseline', /capture_tender_award_commitment/.test(sql) && /Created from frozen Commercial Baseline/.test(sql));
check('commitment and forecast snapshots are immutable', /project_commercial_commitments_immutable/.test(sql) && /project_cost_package_forecasts_immutable/.test(sql));
check('all roadmap forecast sources are available', ['FRAMEWORK_QUOTE_CALLOFF','SUPPLIER_QUOTATION','LANDLORD_CONTRIBUTION','MANUAL_ESTIMATE','BUDGET_FALLBACK'].every(value => sql.includes(value)));
check('financial overview aggregates the five required columns', ['budgetValue','committedValue','additionalWorks','forecastValue','variance'].every(value => sql.includes(`'${value}'`)));
check('approved Additional Works enter committed value', /base_commitment\+additional_works committed_value/.test(sql) && /variation\.status='APPROVED'/.test(sql));
check('writes require scoped capabilities', /has_project_capability\(p_project_id,'COMMERCIAL_APPROVE',p_cost_package_id\)/.test(sql) && /has_project_capability\(p_project_id,'TENDER_MANAGE',p_cost_package_id\)/.test(sql));

console.log(`\nCost Package financial migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
