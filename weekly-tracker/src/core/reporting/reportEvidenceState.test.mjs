import assert from 'node:assert/strict';
import {
  REPORT_ITEM_EVIDENCE_STATES,
  assertReportItemEvidenceState,
  isFreshReportItemEvidence,
  resolvePersistedReportItemEvidenceState,
} from './reportEvidenceState.js';

assert.deepEqual(REPORT_ITEM_EVIDENCE_STATES, ['UPDATED', 'CONFIRMED_UNCHANGED', 'CARRIED_UNREVIEWED', 'NOT_IN_REPORTING_SCOPE', 'LEGACY_UNSPECIFIED']);
assert.equal(resolvePersistedReportItemEvidenceState(null), 'LEGACY_UNSPECIFIED');
assert.equal(isFreshReportItemEvidence('UPDATED'), true);
assert.equal(isFreshReportItemEvidence('CARRIED_UNREVIEWED'), false);
assert.throws(() => assertReportItemEvidenceState('LEGACY_UNSPECIFIED'));
console.log('reportEvidenceState: PASS');
