import assert from 'node:assert/strict';
import { fingerprintReportScope, scopeFingerprintPayload } from './reportScopeSnapshot.js';

const left = { templateId: 't1', templateVersion: 2, schemaVersion: 2, selectedWpIds: ['b', 'a', 'a'], reportPeriodStart: '2026-08-01', reportPeriodEnd: '2026-08-07' };
const right = { ...left, selectedWpIds: ['a', 'b'] };
assert.equal(scopeFingerprintPayload(left), scopeFingerprintPayload(right));
assert.equal(await fingerprintReportScope(left), await fingerprintReportScope(right));
assert.notEqual(await fingerprintReportScope(left), await fingerprintReportScope({ ...right, reportPeriodEnd: '2026-08-08' }));
console.log('reportScopeSnapshot: PASS');
