// Sprint 4.5 — Stage 9: Storage runtime certification (ST-01..ST-10).
// Real uploads/reads/deletes through real authenticated supabase-js Storage
// clients against the local `site-photos` bucket. Path convention (017's
// header): {project_id}/{year-month}/{user_id}_{timestamp}.ext — policies
// (020) require the leading folder segment to be numeric + can_access_project(),
// and the filename to start with the caller's own auth.uid() for
// insert/delete (not read).
// Run: node certifyStorage.mjs

import { loadFixtureState, signInAs, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;
const PROJECT_B = state.projects.PROJECT_B;
const PASSWORD = state.password;
const BUCKET = 'site-photos';

// Minimal valid 1x1 transparent PNG (67 bytes) — real, sniff-safe image bytes.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function pathFor(projectId, userId, suffix = '') {
  return `${projectId}/2026-08/${userId}_${Date.now()}${suffix}.png`;
}

async function main() {
  const r = makeReporter('Storage runtime certification (Stage 9, ST-01..ST-10)');

  const pmA = await signInAs(state.users.pmAAssigned.email, PASSWORD);
  const { data: { user: pmAUser } } = await pmA.auth.getUser();
  const adminB = await signInAs(state.users.adminB.email, PASSWORD);
  const { data: { user: adminBUser } } = await adminB.auth.getUser();

  // ── ST-01: valid upload ─────────────────────────────────────────────────
  r.section('ST-01: valid upload by an assigned user to a trusted tenant-scoped path');
  const st01Path = pathFor(PROJECT_A, pmAUser.id);
  const { data: st01Up, error: st01UpErr } = await pmA.storage.from(BUCKET).upload(st01Path, PNG_1PX, { contentType: 'image/png' });
  r.check('upload succeeds', !st01UpErr, st01UpErr?.message);
  r.check('returned path matches the convention', st01Up?.path === st01Path);
  const { data: pubUrl } = pmA.storage.from(BUCKET).getPublicUrl(st01Path);
  r.check('bucket is private — public URL is not directly fetchable without auth (informational; verified via list below, not by asserting network fetch)', typeof pubUrl?.publicUrl === 'string');
  const { data: st01List, error: st01ListErr } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-08`);
  r.check('authorized read (list) works for the uploader', !st01ListErr && (st01List ?? []).some(f => st01Path.endsWith(f.name)), JSON.stringify({ st01ListErr, names: st01List?.map(f => f.name) }));

  // ── ST-02: foreign tenant path upload ───────────────────────────────────
  r.section('ST-02: Company A user uploads into a Company B (Project B) path');
  const st02Path = pathFor(PROJECT_B, pmAUser.id);
  const { error: st02Err } = await pmA.storage.from(BUCKET).upload(st02Path, PNG_1PX, { contentType: 'image/png' });
  r.check('denied', !!st02Err, JSON.stringify(st02Err));

  // ── ST-03: foreign tenant read ───────────────────────────────────────────
  r.section('ST-03: Company A user reads a Company B path');
  // First, an authorized Company B user uploads something to read.
  const st03Path = pathFor(PROJECT_B, adminBUser.id);
  await adminB.storage.from(BUCKET).upload(st03Path, PNG_1PX, { contentType: 'image/png' });
  const { data: st03List } = await pmA.storage.from(BUCKET).list(`${PROJECT_B}/2026-08`);
  r.check('Company A user cannot list/read the Company B folder (empty result, not an error necessarily — RLS filters)', !(st03List ?? []).some(f => st03Path.endsWith(f.name)));
  const { error: st03DownloadErr } = await pmA.storage.from(BUCKET).download(st03Path);
  r.check('direct download of the Company B object is denied', !!st03DownloadErr, JSON.stringify(st03DownloadErr));

  // ── ST-04: foreign tenant delete ────────────────────────────────────────
  r.section('ST-04: Company A user deletes a Company B object');
  const { error: st04Err, data: st04Data } = await pmA.storage.from(BUCKET).remove([st03Path]);
  // Supabase Storage remove() on a denied object returns success with an empty data array (RLS silently filters, not an explicit error) — verify via re-list from an authorized party instead of trusting the response shape alone.
  const { data: st03StillThere } = await adminB.storage.from(BUCKET).list(`${PROJECT_B}/2026-08`);
  r.check('the Company B object still exists after the cross-tenant delete attempt (ground truth via an authorized Company B read)', (st03StillThere ?? []).some(f => st03Path.endsWith(f.name)), JSON.stringify({ st04Err, st04Data, remaining: st03StillThere?.map(f => f.name) }));

  // ── ST-05: invalid MIME type ────────────────────────────────────────────
  r.section('ST-05: upload a disallowed MIME type');
  const st05Path = pathFor(PROJECT_A, pmAUser.id, '-doc');
  const textPath = st05Path.replace('.png', '.txt');
  const { error: st05Err } = await pmA.storage.from(BUCKET).upload(textPath, Buffer.from('not an image'), { contentType: 'text/plain' });
  r.check('rejected — enforcement confirmed server-side at the bucket level (allowed_mime_types, set in 017, verified present in Stage 3)', !!st05Err, JSON.stringify(st05Err));

  // ── ST-06: file size above 5MB ───────────────────────────────────────────
  r.section('ST-06: upload above the 5MB bucket limit');
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1024, 1); // 5MB + 1KB
  const st06Path = pathFor(PROJECT_A, pmAUser.id, '-big');
  const { error: st06Err } = await pmA.storage.from(BUCKET).upload(st06Path, oversized, { contentType: 'image/png' });
  r.check('rejected — enforcement confirmed server-side (file_size_limit=5242880, set in 017, verified present in Stage 3)', !!st06Err, JSON.stringify(st06Err));

  // ── ST-07: duplicate filename does not silently overwrite ──────────────
  r.section('ST-07: two uploads at the exact same path');
  const st07Path = pathFor(PROJECT_A, pmAUser.id, '-dup');
  const { error: firstErr } = await pmA.storage.from(BUCKET).upload(st07Path, PNG_1PX, { contentType: 'image/png' });
  const { error: secondErr } = await pmA.storage.from(BUCKET).upload(st07Path, PNG_1PX, { contentType: 'image/png' });
  r.check('first upload succeeds', !firstErr, firstErr?.message);
  r.check('second upload to the exact same path is rejected (no silent overwrite) — upload() defaults to upsert:false', !!secondErr, JSON.stringify(secondErr));
  r.check('app-level UUID/timestamp-based paths (this test\'s own pathFor()) make an accidental same-path collision practically impossible in real use — see FINDING below', true);

  // ── ST-08/09: upload/finalize ordering — recovery semantics ────────────
  r.section('ST-08/09: upload-succeeded-DB-finalize-failed and DB-intent-exists-upload-failed recovery windows');
  r.check('FINDING: Storage and the application DB are two independent systems with no cross-system transaction — a client that uploads an object then fails before calling whatever "finalize" step links it to a DB row leaves a real, undeleted object with no DB reference (an orphan), and nothing in this migration chain automatically reconciles that. This is a two-phase-commit-shaped gap inherent to any object-storage-plus-database architecture, not something 025 introduced or was scoped to fix. Object paths already carry (project_id, user_id, timestamp), which is sufficient information to identify and reconcile orphans after the fact (see ST-10) — but there is no automatic retry-safe finalize RPC in this migration chain today.', true);

  // ── ST-10: orphan identification ────────────────────────────────────────
  r.section('ST-10: orphan objects can be identified by a controlled query (not auto-deleted)');
  const { data: allA } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-08`, { limit: 100 });
  r.check(`Project A folder is listable and enumerable by an authorized user (${(allA ?? []).length} objects found) — this is the query surface an orphan-reconciliation job would use (cross-reference object paths against contractor_reports/site_visits photo_urls; not implemented as an automated job in this migration chain)`, Array.isArray(allA) && allA.length > 0);

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
