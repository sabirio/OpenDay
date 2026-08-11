// Snag lifecycle security certification (SLS-01..SLS-10) — P0 lifecycle-UI
// task. Frontend button visibility is not authorization; every one of these
// calls the REAL execute_snag_command RPC directly (bypassing the UI
// entirely, simulating a forged API call) through a REAL authenticated
// client, then verifies actual persisted state via direct psql ground truth.
// Run: node scripts/certification/certifySnagLifecycleSecurity.mjs

import { randomUUID } from 'node:crypto';
import { countRows, makeReporter, psql, requireCertificationEnvironment, signInAs } from './lib.mjs';
import { getLocalFixturePassword } from './fixturePassword.mjs';

await requireCertificationEnvironment();

const PASSWORD = getLocalFixturePassword();
const LEGACY_PROJECT = 950002; // KZ-TEST-02, Contractor A (contractor-ws-a) assigned
const OTHER_PROJECT = 950004;  // KZ-TEST-04, Contractor B (contractor-ws-b) assigned, NOT Contractor A

const r = makeReporter('Snag lifecycle security certification (SLS-01..SLS-10)');

async function execCmd(client, { type, projectId, snagId, payload, expectedVersion }) {
  return client.rpc('execute_snag_command', {
    p_command: { type, projectId: Number(projectId), snagId: snagId ?? null, payload: payload || {} },
    p_client_request_id: randomUUID(),
    p_expected_version: expectedVersion ?? null,
  });
}

async function createSnag(client, projectId, title, assigneeId, dueDate) {
  const { data, error } = await execCmd(client, {
    type: 'createSnag', projectId,
    payload: { title, description: 'SLS security fixture', categoryCode: 'GENERAL', disciplineCode: 'GENERAL', priority: 'MEDIUM', assigneeId, dueDate, location: { text: 'SLS fixture location' } },
  });
  if (error) throw new Error(`fixture setup failed: ${JSON.stringify(error)}`);
  return data.snag;
}

async function main() {
  const contractorA = await signInAs('contractor-ws-a@cert.local', PASSWORD);
  const contractorB = await signInAs('contractor-ws-b@cert.local', PASSWORD);
  const pmA = await signInAs('pm-a-assigned@cert.local', PASSWORD);

  const contractorAId = psql(`SELECT id FROM auth.users WHERE email='contractor-ws-a@cert.local';`);
  const contractorBId = psql(`SELECT id FROM auth.users WHERE email='contractor-ws-b@cert.local';`);

  // Fixture: one ASSIGNED snag on the legacy project, assigned to Contractor A.
  const snagA = await createSnag(pmA, LEGACY_PROJECT, 'SLS fixture - assigned to Contractor A', contractorAId, '2026-09-01');
  r.section('Fixture setup');
  r.check('fixture snag created and ASSIGNED to Contractor A', snagA.status === 'ASSIGNED' && snagA.assignee_id === contractorAId);

  // ── SLS-01: Contractor A can legitimately start work on their own assigned snag ──
  r.section('SLS-01: Contractor A starts work on their own assigned Observation (baseline: this must work)');
  const { data: sls01, error: sls01Err } = await execCmd(contractorA, { type: 'startSnagWork', projectId: LEGACY_PROJECT, snagId: snagA.id, expectedVersion: snagA.version });
  r.check('accepted', !sls01Err, JSON.stringify(sls01Err));
  r.check('status is IN_PROGRESS', sls01?.snag?.status === 'IN_PROGRESS');
  let version = sls01?.snag?.version ?? snagA.version;

  // ── SLS-02: Contractor A cannot close/approve their own Observation ──
  const { data: readyData } = await execCmd(contractorA, { type: 'markSnagReadyForReview', projectId: LEGACY_PROJECT, snagId: snagA.id, expectedVersion: version });
  version = readyData.snag.version;
  r.section('SLS-02: Contractor A cannot approve/close their own Observation (self-approval)');
  const { error: sls02Err } = await execCmd(contractorA, { type: 'approveAndCloseSnag', projectId: LEGACY_PROJECT, snagId: snagA.id, expectedVersion: version });
  r.check('denied', !!sls02Err, JSON.stringify(sls02Err));
  r.check('error is FORBIDDEN (42501)', sls02Err?.code === '42501' || /COMMAND_FORBIDDEN/.test(sls02Err?.message ?? ''), sls02Err?.message);
  r.check('status unchanged (still READY_FOR_REVIEW, not CLOSED)', psql(`SELECT status FROM snags WHERE id='${snagA.id}';`) === 'READY_FOR_REVIEW');

  // ── SLS-03: Contractor A cannot reject (forged PM action) ──
  r.section('SLS-03: Contractor A cannot execute rejectSnag (a PM-only transition) through a forged call');
  const { error: sls03Err } = await execCmd(contractorA, { type: 'rejectSnag', projectId: LEGACY_PROJECT, snagId: snagA.id, expectedVersion: version, payload: { reason: 'self-forged reject' } });
  r.check('denied', !!sls03Err, JSON.stringify(sls03Err));
  r.check('error is FORBIDDEN', sls03Err?.code === '42501' || /COMMAND_FORBIDDEN/.test(sls03Err?.message ?? ''), sls03Err?.message);

  // ── SLS-04: Contractor B cannot mutate Contractor A's Observation ──
  r.section('SLS-04: Contractor B cannot act on an Observation assigned to Contractor A');
  const { error: sls04Err } = await execCmd(contractorB, { type: 'approveAndCloseSnag', projectId: LEGACY_PROJECT, snagId: snagA.id, expectedVersion: version });
  r.check('denied', !!sls04Err, JSON.stringify(sls04Err));
  const { error: sls04bErr } = await execCmd(contractorB, { type: 'startSnagWork', projectId: LEGACY_PROJECT, snagId: snagA.id, expectedVersion: version });
  r.check('Contractor B also denied startSnagWork on it (not the assignee, even though role matches)', !!sls04bErr, JSON.stringify(sls04bErr));
  r.check('error is FORBIDDEN', sls04bErr?.code === '42501' || /COMMAND_FORBIDDEN/.test(sls04bErr?.message ?? ''), sls04bErr?.message);
  r.check('status still unchanged after both attempts', psql(`SELECT status FROM snags WHERE id='${snagA.id}';`) === 'READY_FOR_REVIEW');

  // ── SLS-05: Contractor A cannot act on an unassigned project's Observation ──
  r.section('SLS-05: Contractor A cannot act on a project she is not assigned to');
  const snagOther = await createSnag(pmA, OTHER_PROJECT, 'SLS fixture - other project, Contractor B assigned', contractorBId, '2026-09-01');
  const { error: sls05Err } = await execCmd(contractorA, { type: 'startSnagWork', projectId: OTHER_PROJECT, snagId: snagOther.id, expectedVersion: snagOther.version });
  r.check('denied', !!sls05Err, JSON.stringify(sls05Err));
  r.check('error is a permission/access denial, not a silent success', sls05Err?.code === '42501' || /FORBIDDEN|ACCESS_DENIED/i.test(sls05Err?.message ?? ''), sls05Err?.message);
  r.check('status unchanged on the other project\'s snag', psql(`SELECT status FROM snags WHERE id='${snagOther.id}';`) === 'ASSIGNED');

  // ── SLS-06: PM cannot execute a Contractor-only transition (forged) ──
  r.section('SLS-06: PM cannot execute startSnagWork (a Contractor-only transition) through a forged call');
  const snagB2 = await createSnag(pmA, LEGACY_PROJECT, 'SLS fixture - PM forgery target', contractorAId, '2026-09-01');
  const { error: sls06Err } = await execCmd(pmA, { type: 'startSnagWork', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: snagB2.version });
  r.check('denied', !!sls06Err, JSON.stringify(sls06Err));
  r.check('error is FORBIDDEN', sls06Err?.code === '42501' || /COMMAND_FORBIDDEN/.test(sls06Err?.message ?? ''), sls06Err?.message);
  r.check('status still ASSIGNED, not silently advanced', psql(`SELECT status FROM snags WHERE id='${snagB2.id}';`) === 'ASSIGNED');

  // ── SLS-07: PM/Admin CAN legitimately approve and reject (baseline: must work) ──
  r.section('SLS-07: PM performs the authorized approve/reject transitions (baseline: this must work)');
  const started = await execCmd(contractorA, { type: 'startSnagWork', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: snagB2.version });
  const ready = await execCmd(contractorA, { type: 'markSnagReadyForReview', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: started.data.snag.version });
  const { data: sls07, error: sls07Err } = await execCmd(pmA, { type: 'rejectSnag', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: ready.data.snag.version, payload: { reason: 'SLS baseline reject' } });
  r.check('PM reject accepted', !sls07Err, JSON.stringify(sls07Err));
  r.check('status returns to IN_PROGRESS (canonical prior state, not a new status)', sls07?.snag?.status === 'IN_PROGRESS');

  // ── SLS-08: reject without a reason is rejected server-side ──
  r.section('SLS-08: rejectSnag without a reason is denied server-side (not just a client-side gate)');
  const ready2 = await execCmd(contractorA, { type: 'markSnagReadyForReview', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: sls07.snag.version });
  const { error: sls08Err } = await execCmd(pmA, { type: 'rejectSnag', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: ready2.data.snag.version, payload: {} });
  r.check('denied', !!sls08Err, JSON.stringify(sls08Err));
  r.check('status unchanged (still READY_FOR_REVIEW)', psql(`SELECT status FROM snags WHERE id='${snagB2.id}';`) === 'READY_FOR_REVIEW');

  // ── SLS-09: CLOSED snag cannot be re-actioned by anyone ──
  r.section('SLS-09: a CLOSED Observation cannot be re-actioned (Contractor or PM)');
  const { data: sls09close } = await execCmd(pmA, { type: 'approveAndCloseSnag', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: ready2.data.snag.version });
  const { error: sls09Err } = await execCmd(contractorA, { type: 'startSnagWork', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: sls09close.snag.version });
  r.check('Contractor cannot restart a CLOSED Observation', !!sls09Err, JSON.stringify(sls09Err));
  const { error: sls09bErr } = await execCmd(pmA, { type: 'approveAndCloseSnag', projectId: LEGACY_PROJECT, snagId: snagB2.id, expectedVersion: sls09close.snag.version });
  r.check('PM cannot re-approve an already-CLOSED Observation', !!sls09bErr, JSON.stringify(sls09bErr));

  // ── SLS-10: Viewer role denied entirely ──
  r.section('SLS-10: Viewer role cannot execute any lifecycle command');
  const viewerA = await signInAs('viewer-a@cert.local', PASSWORD);
  const snagV = await createSnag(pmA, LEGACY_PROJECT, 'SLS fixture - viewer target', contractorAId, '2026-09-01');
  const { error: sls10Err } = await execCmd(viewerA, { type: 'startSnagWork', projectId: LEGACY_PROJECT, snagId: snagV.id, expectedVersion: snagV.version });
  r.check('denied', !!sls10Err, JSON.stringify(sls10Err));

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main();
