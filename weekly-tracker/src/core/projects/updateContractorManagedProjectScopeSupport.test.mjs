// updateContractorManagedProjectScopeSupport.test.mjs — Simplification Phase
// 3D.2.1. Pure-logic tests for the Scope-sync command's own error
// classification (resolveActiveScopeWPIds is re-exported unchanged from
// createContractorManagedProjectSupport.js and is already covered by that
// file's own test suite — not re-tested here). The RPC call itself (the
// command's happy/DB path, including the lifecycle-lock rejections) is
// certified end-to-end against a real Postgres instance by
// scripts/certification/certifyContractorManagedScopeSync.mjs — no
// Supabase/network mocking is introduced here.

import { classifyScopeSyncError } from './updateContractorManagedProjectScopeSupport.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nclassifyScopeSyncError: every canonical server error code maps to a safe message');
{
  const cases = [
    'EMPTY_SCOPE: at least one active Scope work package is required',
    'INVALID_WORK_PACKAGE: a Scope work package id must not be null',
    'DUPLICATE_WORK_PACKAGE: each Scope work package may appear only once',
    'WORK_PACKAGE_OUT_OF_TEMPLATE: every Scope work package must belong to the resolved template',
    'TEMPLATE_NOT_CONFIGURED: this project has no resolvable scope template',
    'NOT_AUTHORIZED: caller cannot edit this project',
    'SCHEDULE_NOT_CONTRACTOR_MANAGED: this command only edits a CONTRACTOR_MANAGED project\'s Scope',
    'SCHEDULE_PENDING_REVIEW: Scope cannot be edited while a schedule submission is pending review',
    'BASELINE_ALREADY_APPROVED: Scope cannot be edited once a baseline is approved',
  ];
  for (const message of cases) {
    const code = message.split(':')[0];
    const result = classifyScopeSyncError({ message }, 'project.update_contractor_managed_scope', 'req-1');
    check(`${code} is classified with matching code`, result?.code === code);
    check(`${code} carries a non-empty safe message that is not the raw server text`, !!result?.message && result.message !== message);
    check(`${code} preserves operation and requestId`, result.operation === 'project.update_contractor_managed_scope' && result.requestId === 'req-1');
    check(`${code} preserves the original error as cause`, result.cause?.message === message);
    check(`${code} is not retryable as-is (same payload/state would fail again)`, result.retryable === false);
  }
}

console.log('\nclassifyScopeSyncError: unrecognized errors fall through (null) to the generic classifier');
{
  const result = classifyScopeSyncError({ message: 'connection reset' }, 'op', 'r');
  check('returns null for an unrecognized message', result === null);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
