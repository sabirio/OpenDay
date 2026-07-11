// Staging cloud certification — RLS runtime checks, adapted from
// scripts/certification/certifyRls.mjs. Every check is a real HTTP call
// through PostgREST from a real signInWithPassword session (or the anon
// client with no session) against the STAGING project — never a
// service-role bypass for the assertions themselves (service-role is
// only used here for the one ground-truth cross-check, matching the
// local harness's own discipline).
//
// Requires .env.staging sourced + scripts/staging/fixtures.mjs already run.
// Run: node scripts/staging/certifyRls.mjs

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
const PROJECT_A2 = state.projects.PROJECT_A2;
const PASSWORD = state.password;

function makeReporter(title) {
  let pass = 0, fail = 0;
  console.log(`\n${title}`);
  return {
    check(label, ok, detail) {
      if (ok) { pass++; console.log(`  OK ${label}`); }
      else { fail++; console.error(`  FAIL ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`); }
    },
    summary() {
      console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --`);
      return { pass, fail };
    },
  };
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
  const r = makeReporter('Staging RLS runtime certification');

  const adminA = await signInAs(state.users.adminA.email, PASSWORD);
  const pmA = await signInAs(state.users.pmAAssigned.email, PASSWORD);
  const contractorAAssigned = await signInAs(state.users.contractorAAssigned.email, PASSWORD);
  const contractorAUnassigned = await signInAs(state.users.contractorAUnassigned.email, PASSWORD);
  const viewerA = await signInAs(state.users.viewerA.email, PASSWORD);
  const adminB = await signInAs(state.users.adminB.email, PASSWORD);
  const anon = anonClient();

  console.log('\n-- Role matrix (own-company, Project A) --');
  for (const [label, client, expect] of [
    ['Admin A', adminA, true], ['PM A (assigned)', pmA, true],
    ['Contractor A (assigned)', contractorAAssigned, true],
    ['Contractor A (unassigned)', contractorAUnassigned, false],
    ['Viewer A', viewerA, true],
  ]) {
    const { data, error } = await client.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    const got = !error && !!data;
    r.check(`${label} SELECT projects/${PROJECT_A} -> ${expect ? 'visible' : 'not visible'}`, got === expect, { data, error });
  }

  console.log('\n-- Direct INSERT into contractor_reports (admin/pm allowed, contractor blocked) --');
  // Self-cleaning: earlier runs' successful inserts (Admin A / PM A) are
  // never rolled back, and fixtures.mjs resets contractor_reports_id_seq
  // back to 900300 on every reseed — so a second run's nextval() collides
  // with the still-present row from run 1 and fails on the pkey, not on
  // RLS. Delete this script's own fixed-date rows first so repeat runs are
  // idempotent regardless of the sequence reset.
  await adminA.from('contractor_reports').delete().eq('project_id', PROJECT_A).gte('report_date', '2099-01-01');
  for (const [label, client, expectDenied, reportDate] of [
    ['Admin A', adminA, false, '2099-03-01'], ['PM A', pmA, false, '2099-03-02'],
    ['Contractor A (assigned)', contractorAAssigned, true, '2099-03-03'], ['Viewer A', viewerA, true, '2099-03-04'],
  ]) {
    const { data, error } = await client.from('contractor_reports').insert({ project_id: PROJECT_A, report_date: reportDate, overall_progress: 1 }).select();
    const denied = !!error && (!data || data.length === 0);
    r.check(`${label} direct INSERT -> ${expectDenied ? 'denied' : 'allowed'}`, denied === expectDenied, { data, error });
  }

  console.log('\n-- UPDATE own-company project (Admin allowed, Viewer denied) --');
  {
    const before = await adminA.from('projects').select('store_code').eq('id', PROJECT_A2).single();
    const { error: adminUpdateErr } = await adminA.from('projects').update({ store_code: 'STG-A2-UPD' }).eq('id', PROJECT_A2);
    r.check('Admin A can UPDATE a Company A project', !adminUpdateErr, adminUpdateErr?.message);
    const { error: viewerUpdateErr } = await viewerA.from('projects').update({ store_code: 'SHOULD-NOT-APPLY' }).eq('id', PROJECT_A2);
    const after = await adminA.from('projects').select('store_code').eq('id', PROJECT_A2).single();
    r.check('Viewer A UPDATE has no effect (RLS-denied, not just erroring)', after.data?.store_code === 'STG-A2-UPD', { viewerUpdateErr, after: after.data, before: before.data });
  }

  console.log('\n-- Cross-tenant: Company B Admin against Project A / Company A --');
  {
    const { data: readAttempt } = await adminB.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    r.check('Company B Admin cannot read Project A', readAttempt == null);

    const { data: crRead } = await adminB.from('contractor_reports').select('id').eq('project_id', PROJECT_A);
    r.check('Company B Admin sees 0 Project A contractor_reports rows', Array.isArray(crRead) && crRead.length === 0);

    const { error: insertErr } = await adminB.from('contractor_reports').insert({ project_id: PROJECT_A, report_date: '2099-03-05', overall_progress: 1 });
    r.check('Company B Admin cannot INSERT a contractor_reports row for Project A', !!insertErr);

    const { data: beforeUpd } = await adminA.from('projects').select('store_code').eq('id', PROJECT_A).single();
    const { error: updErr } = await adminB.from('projects').update({ store_code: 'HACKED' }).eq('id', PROJECT_A);
    const { data: afterUpd } = await adminA.from('projects').select('store_code').eq('id', PROJECT_A).single();
    r.check('Company B Admin UPDATE on Project A has no effect', afterUpd?.store_code === beforeUpd?.store_code, { updErr: updErr?.message, before: beforeUpd, after: afterUpd });
  }

  console.log('\n-- Cross-tenant RPC (Company B PM calling atomic RPC against Project A) --');
  {
    const pmB = await signInAs(state.users.pmB.email, PASSWORD);
    const { error } = await pmB.rpc('submit_site_visit_atomic', {
      p_project_id: PROJECT_A, p_contractor_report_id: null, p_visit_date: '2026-09-20',
      p_observations: [{ wpId: 'demo.walls', observed_progress: 10, observed_status: 'in_progress', gc_progress: 10 }],
      p_meta: {}, p_client_request_id: '33333333-3333-3333-3333-333333333333',
    });
    r.check('Company B PM cannot call submit_site_visit_atomic for Project A', !!error, error);
  }

  console.log('\n-- Unauthenticated (anon key, no session) --');
  {
    const { data } = await anon.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    r.check('anon cannot read Project A', data == null);

    const { error: insertErr } = await anon.from('contractor_reports').insert({ project_id: PROJECT_A, report_date: '2099-03-06' });
    r.check('anon cannot INSERT into contractor_reports', !!insertErr);

    const { error: rpcErr } = await anon.rpc('submit_contractor_report_atomic', {
      p_project_id: PROJECT_A, p_report_date: '2026-09-21', p_wp_progress: [], p_meta: {},
      p_client_request_id: '44444444-4444-4444-4444-444444444444',
    });
    r.check('anon cannot call submit_contractor_report_atomic', !!rpcErr, rpcErr?.message);
  }

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('STAGING RLS CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
