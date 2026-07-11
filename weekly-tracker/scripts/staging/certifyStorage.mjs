// Staging cloud certification — Storage runtime checks, adapted from
// scripts/certification/certifyStorage.mjs. Real uploads/reads/deletes
// through real authenticated supabase.storage clients against the
// STAGING project's private `site-photos` bucket.
//
// Requires .env.staging sourced + scripts/staging/fixtures.mjs already run.
// Run: node scripts/staging/certifyStorage.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..', '..');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('REFUSING TO RUN: requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (source .env.staging first).');
  process.exit(1);
}
execFileSync(process.execPath, [path.join(appRoot, 'scripts', 'staging', 'assertStagingTarget.mjs')], { stdio: 'inherit' });

const state = JSON.parse(readFileSync(path.join(__dirname, 'staging-fixture-state.json'), 'utf8'));
const PROJECT_A = state.projects.PROJECT_A;
const PROJECT_B = state.projects.PROJECT_B;
const PASSWORD = state.password;
const BUCKET = 'site-photos';

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function pathFor(projectId, userId, suffix = '') {
  return `${projectId}/2026-09/${userId}_${Date.now()}${suffix}.png`;
}

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

async function signInAs(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  console.log('Staging Storage runtime certification');

  const pmA = await signInAs(state.users.pmAAssigned.email, PASSWORD);
  const { data: { user: pmAUser } } = await pmA.auth.getUser();
  const adminB = await signInAs(state.users.adminB.email, PASSWORD);
  const { data: { user: adminBUser } } = await adminB.auth.getUser();

  console.log('\n-- ST-01: valid upload by an assigned user --');
  const st01Path = pathFor(PROJECT_A, pmAUser.id);
  const { data: st01Up, error: st01UpErr } = await pmA.storage.from(BUCKET).upload(st01Path, PNG_1PX, { contentType: 'image/png' });
  check('upload succeeds', !st01UpErr, st01UpErr?.message);
  check('returned path matches the convention', st01Up?.path === st01Path);
  const { data: st01List } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-09`);
  check('authorized read (list) works for the uploader', (st01List ?? []).some(f => st01Path.endsWith(f.name)));

  console.log('\n-- ST-02: Company A user uploads into a Company B path --');
  const st02Path = pathFor(PROJECT_B, pmAUser.id);
  const { error: st02Err } = await pmA.storage.from(BUCKET).upload(st02Path, PNG_1PX, { contentType: 'image/png' });
  check('denied', !!st02Err, st02Err);

  console.log('\n-- ST-03: Company A user reads a Company B path --');
  const st03Path = pathFor(PROJECT_B, adminBUser.id);
  await adminB.storage.from(BUCKET).upload(st03Path, PNG_1PX, { contentType: 'image/png' });
  const { data: st03List } = await pmA.storage.from(BUCKET).list(`${PROJECT_B}/2026-09`);
  check('Company A user cannot list the Company B folder', !(st03List ?? []).some(f => st03Path.endsWith(f.name)));
  const { error: st03DownloadErr } = await pmA.storage.from(BUCKET).download(st03Path);
  check('direct download of the Company B object is denied', !!st03DownloadErr);

  console.log('\n-- ST-04: Company A user deletes a Company B object (denied) --');
  await pmA.storage.from(BUCKET).remove([st03Path]);
  const { data: st03StillThere } = await adminB.storage.from(BUCKET).list(`${PROJECT_B}/2026-09`);
  check('the Company B object still exists after the cross-tenant delete attempt', (st03StillThere ?? []).some(f => st03Path.endsWith(f.name)));

  console.log('\n-- ST-04b: own-tenant upload -> delete lifecycle, cross-tenant/anon delete denied throughout --');
  {
    const st04bPath = pathFor(PROJECT_A, pmAUser.id, '-owndelete');
    const { error: upErr } = await pmA.storage.from(BUCKET).upload(st04bPath, PNG_1PX, { contentType: 'image/png' });
    check('setup: upload succeeds', !upErr, upErr?.message);
    const { data: beforeDelete } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-09`);
    check('authorized lookup confirms the object exists before delete', (beforeDelete ?? []).some(f => st04bPath.endsWith(f.name)));

    await adminB.storage.from(BUCKET).remove([st04bPath]);
    const { data: afterCrossAttempt } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-09`);
    check('cross-tenant delete attempt has no effect', (afterCrossAttempt ?? []).some(f => st04bPath.endsWith(f.name)));

    const anon = anonClient();
    await anon.storage.from(BUCKET).remove([st04bPath]);
    const { data: afterAnonAttempt } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-09`);
    check('anonymous delete attempt has no effect', (afterAnonAttempt ?? []).some(f => st04bPath.endsWith(f.name)));

    const { error: delErr } = await pmA.storage.from(BUCKET).remove([st04bPath]);
    check('own-tenant delete succeeds', !delErr, delErr?.message);
    const { data: afterDelete } = await pmA.storage.from(BUCKET).list(`${PROJECT_A}/2026-09`);
    check('authorized lookup confirms the object no longer exists', !(afterDelete ?? []).some(f => st04bPath.endsWith(f.name)));
    const { error: downloadAfterDeleteErr } = await pmA.storage.from(BUCKET).download(st04bPath);
    check('direct download of the deleted object fails', !!downloadAfterDeleteErr);
  }

  console.log('\n-- ST-05: invalid MIME type rejected --');
  const st05Path = pathFor(PROJECT_A, pmAUser.id, '-doc').replace('.png', '.txt');
  const { error: st05Err } = await pmA.storage.from(BUCKET).upload(st05Path, Buffer.from('not an image'), { contentType: 'text/plain' });
  check('rejected server-side', !!st05Err, st05Err);

  console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('STAGING STORAGE CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
