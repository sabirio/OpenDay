// contractorReportLookaheadFields.test.mjs - 023 contract: contractor_reports
// gains next_week_top3/week_after_top3/activities_blocked/delay_reason/
// pending_issues/final_comments, and submit_contractor_report() populates
// them from p_meta.reportSnapshot instead of silently dropping them.
// Run: node src/tests/contractorReportLookaheadFields.test.mjs

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const migration = readFileSync(new URL('../migrations/023_contractor_report_lookahead_fields.sql', import.meta.url), 'utf8');

console.log('\ncontractorReportLookaheadFields - 023 contract');

const NEW_COLUMNS = [
  'next_week_top3', 'week_after_top3', 'activities_blocked',
  'delay_reason', 'pending_issues', 'final_comments',
];

for (const col of NEW_COLUMNS) {
  check(`ALTER TABLE adds ${col}`,
    new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s+text`).test(migration));
}

check('RPC INSERT lists all 6 new columns',
  NEW_COLUMNS.every(col => new RegExp(`INSERT INTO public\\.contractor_reports \\([\\s\\S]*?${col}[\\s\\S]*?\\)\\s*VALUES`).test(migration)));

const SNAPSHOT_FIELDS = [
  'nextWeekTop3', 'weekAfterTop3', 'activitiesBlocked',
  'delayReason', 'pendingIssues', 'finalComments',
];
for (const field of SNAPSHOT_FIELDS) {
  check(`RPC VALUES reads ${field} from p_meta.reportSnapshot`,
    migration.includes(`p_meta->'reportSnapshot'->>'${field}'`));
}

check('function signature unchanged (single call site, safe to supersede in place)',
  /CREATE OR REPLACE FUNCTION public\.submit_contractor_report\(\s*p_project_id bigint,\s*p_report_date date,\s*p_wp_progress jsonb DEFAULT '\[\]'::jsonb,\s*p_meta jsonb DEFAULT '\{\}'::jsonb\s*\)/.test(migration));

check('still authenticated-only execute grant',
  /GRANT EXECUTE ON FUNCTION public\.submit_contractor_report\(bigint, date, jsonb, jsonb\) TO authenticated;/.test(migration));

check('has a rollback note dropping the 6 columns', /Rollback:[\s\S]*DROP COLUMN IF EXISTS next_week_top3/.test(migration));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
