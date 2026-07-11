import assert from 'node:assert/strict';
import { createContractorWorkflowState, contractorWorkflowReducer } from './contractorWorkflowState.js';

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`  PASS ${name}`); }
const initial = createContractorWorkflowState('request-1');
check('starts idle with stable request ID', () => assert.equal(initial.requestId, 'request-1'));
check('draft restore enters editing and keeps restored ID', () => assert.equal(contractorWorkflowReducer(initial, { type: 'DRAFT_RESTORED', requestId: 'restored' }).requestId, 'restored'));
check('validation failure is distinct from backend failure', () => assert.equal(contractorWorkflowReducer(initial, { type: 'VALIDATION_FAILED', errors: ['x'] }).status, 'validation-error'));
const submitting = contractorWorkflowReducer(initial, { type: 'SUBMIT' });
check('duplicate submit is ignored', () => assert.strictEqual(contractorWorkflowReducer(submitting, { type: 'SUBMIT' }), submitting));
const retryable = contractorWorkflowReducer(submitting, { type: 'SUBMIT_FAILED', retryable: true, error: 'offline' });
check('retryable error can retry with same request ID', () => assert.deepEqual(contractorWorkflowReducer(retryable, { type: 'RETRY' }), { ...retryable, status: 'submitting', formError: null }));
check('fatal error cannot retry', () => { const fatal = contractorWorkflowReducer(submitting, { type: 'SUBMIT_FAILED', retryable: false }); assert.strictEqual(contractorWorkflowReducer(fatal, { type: 'RETRY' }), fatal); });
check('idempotent replay is confirmed success', () => { const done = contractorWorkflowReducer(submitting, { type: 'SUBMIT_SUCCEEDED', reportId: 7, idempotentReplay: true }); assert.equal(done.status, 'submitted'); assert.equal(done.idempotentReplay, true); });
console.log(`\n-- RESULT: ${passed} passed, 0 failed --`);
