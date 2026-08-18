import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/135_payment_commitment_scope.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/ProjectPayments.jsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/paymentService.js', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../hooks/useProjectPaymentSchedule.js', import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) { passed++; console.log(`  PASS ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

check('Payment Schedule pins Commitment and Cost Package with a composite FK',
  /ADD COLUMN IF NOT EXISTS commitment_id uuid/.test(sql)
  && /ADD COLUMN IF NOT EXISTS cost_package_id uuid/.test(sql)
  && /FOREIGN KEY\(commitment_id, project_id, cost_package_id\)/.test(sql));
check('draft active and version uniqueness are per Commitment',
  /one_draft_per_commitment_idx/.test(sql)
  && /one_active_per_commitment_idx/.test(sql)
  && /commitment_version_idx/.test(sql));
check('ambiguous historical awards are not guessed',
  /1 = \([\s\S]*count\(\*\)[\s\S]*source_award_id = schedule\.award_id/.test(sql)
  && /legacyUnmappedScheduleCount/.test(sql));
check('schedule command requires explicit Commitment and derives amounts from it',
  /p_commitment_id uuid/.test(sql)
  && /PAYMENT_SCHEDULE_REQUIRES_COMMITMENT/.test(sql)
  && /v_commitment\.committed_value \* v_total_pct/.test(sql)
  && !/ORDER BY awarded_at DESC LIMIT 1/.test(sql));
check('activation supersedes only the same Commitment',
  /WHERE commitment_id = v_schedule\.commitment_id AND status = 'ACTIVE'/.test(sql));
check('Payment Closeout aggregates all scoped active schedules',
  /sum\(schedule\.contract_value\)/.test(sql)
  && /schedule\.status = 'ACTIVE' AND schedule\.commitment_id IS NOT NULL/.test(sql)
  && /PAYMENT_CLOSEOUT_CURRENCY_MISMATCH/.test(sql));
check('UI selects an explicit Commitment and Cost Package',
  /Commitment \/ Cost Package/.test(page) && /selectCommitment/.test(page + hook)
  && /p_commitment_id/.test(service));
check('Retention read is pinned to the selected Payment Schedule',
  /p_payment_schedule_id/.test(service) && /get_project_payment_retention\(bigint,uuid\)/.test(sql));

console.log(`\nPayment Commitment Scope: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
