import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/136_legacy_operational_referential_integrity.sql', import.meta.url), 'utf8');
let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('migration audits all legacy parent identities before mutation',
  ['CONTRACTOR_REPORT_PROJECT_ORPHANS_REQUIRE_REPAIR', 'CONTRACTOR_REPORT_ITEM_PARENT_ORPHANS_REQUIRE_REPAIR',
    'SITE_VISIT_PROJECT_ORPHANS_REQUIRE_REPAIR', 'SITE_VISIT_ITEM_PARENT_ORPHANS_REQUIRE_REPAIR',
    'SITE_VISIT_DISCREPANCY_PARENT_ORPHANS_REQUIRE_REPAIR', 'PROGRESS_HISTORY_PROJECT_ORPHANS_REQUIRE_REPAIR']
    .every(code => sql.includes(code)));
check('Report and Site Visit parents have project foreign keys',
  /contractor_reports_project_fk/.test(sql) && /site_visits_project_fk/.test(sql)
  && /progress_history_project_fk/.test(sql));
check('children use composite parent/project foreign keys',
  /FOREIGN KEY\(report_id,\s*project_id\)/.test(sql)
  && (sql.match(/FOREIGN KEY\(site_visit_id,\s*project_id\)/g) || []).length === 2);
check('nullable operational project identities become mandatory',
  /site_visits ALTER COLUMN project_id SET NOT NULL/.test(sql)
  && /progress_history ALTER COLUMN project_id SET NOT NULL/.test(sql));
check('foreign keys are staged NOT VALID then explicitly validated',
  (sql.match(/NOT VALID/g) || []).length === 6
  && (sql.match(/VALIDATE CONSTRAINT/g) || []).length === 6);
check('all parent deletions are restricted', (sql.match(/ON DELETE RESTRICT NOT VALID/g) || []).length === 6);

console.log(`\nLegacy Operational Referential Integrity: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
