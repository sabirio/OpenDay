import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/132_historical_commercial_data_foundation.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
const check = (name, condition) => { if (condition) { passed += 1; console.log(`  PASS ${name}`); } else { failed += 1; console.error(`  FAIL ${name}`); } };

check('historical bid facts preserve quantities and prices', /project_tender_historical_bid_line_facts/.test(sql) && /consultant_quantity/.test(sql) && /contractor_quantity/.test(sql) && /labour_rate/.test(sql) && /material_rate/.test(sql));
check('category spread is frozen when a round closes', /capture_historical_category_spreads_on_close/.test(sql) && /price_spread_pct/.test(sql));
check('procurement contractor consultant and owner dimensions are captured', ['procurement_method','contractor_user_id','consultant_user_id','cost_package_owner_user_id'].every(value => sql.includes(value)));
check('commitment Additional Work and forecast create financial events', ['COMMITMENT_CREATED','ADDITIONAL_WORK_APPROVED','FORECAST_CREATED'].every(value => sql.includes(value)));
check('all historical fact tables reject mutation', (sql.match(/_immutable BEFORE UPDATE OR DELETE/g) || []).length === 3);
check('historical tables have scoped read policies', /historical_bid_line_facts_read/.test(sql) && /historical_category_spreads_read/.test(sql) && /historical_financial_events_read/.test(sql));
check('existing records are backfilled without rewriting source snapshots', (sql.match(/ON CONFLICT\(.*\)DO NOTHING/g) || []).length >= 5);
check('email sent is now an explicit invitation event', /'SENT'/.test(sql) && /email_sent_at/.test(sql));
check('no Historical Intelligence UI is introduced', !/CREATE.*VIEW.*historical.*intelligence/is.test(sql));

console.log(`\nHistorical commercial data migration: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
