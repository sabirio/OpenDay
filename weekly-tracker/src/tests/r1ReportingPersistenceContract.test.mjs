import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPORT_ITEM_EVIDENCE_STATES } from '../core/reporting/reportEvidenceState.js';

const migration = readFileSync(new URL('../migrations/059_reporting_evidence_provenance.sql', import.meta.url), 'utf8');
for (const state of REPORT_ITEM_EVIDENCE_STATES) assert.ok(migration.includes(`'${state}'`));
for (const field of ['report_item_state', 'source_report_wp_id', 'confirmation_mode', 'batch_confirmation_id', 'scope_snapshot_id']) assert.ok(migration.includes(field));
assert.ok(migration.includes('contractor_report_scope_snapshots'));
assert.ok(migration.includes('submit_contractor_report_r1_base'));
assert.ok(migration.includes('capture_contractor_report_scope_snapshot'));
console.log('r1ReportingPersistenceContract: PASS');
