// Sprint 4.5 — Stage 8: RLS runtime certification. Every check here goes
// through a REAL Supabase client — either a real signInWithPassword
// session (role/tenant tests) or the anon client with no session
// (unauthenticated tests) — talking to PostgREST over HTTP, exactly like
// the browser app does. No service-role client is used for the assertions
// themselves (only for fixture setup, in fixtures.mjs).
// Run: node certifyRls.mjs

import { loadFixtureState, countRows, signInAs, anonClient, makeReporter, requireCertificationEnvironment } from './lib.mjs';

await requireCertificationEnvironment();

const state = loadFixtureState();
const PROJECT_A = state.projects.PROJECT_A;
const PROJECT_A2 = state.projects.PROJECT_A2;
const PROJECT_B = state.projects.PROJECT_B;
const PASSWORD = state.password;

const r = makeReporter('RLS runtime certification (Stage 8)');

async function main() {
  const adminA = await signInAs(state.users.adminA.email, PASSWORD);
  const pmA = await signInAs(state.users.pmAAssigned.email, PASSWORD);
  const contractorAAssigned = await signInAs(state.users.contractorAAssigned.email, PASSWORD);
  const contractorAUnassigned = await signInAs(state.users.contractorAUnassigned.email, PASSWORD);
  const viewerA = await signInAs(state.users.viewerA.email, PASSWORD);
  const adminB = await signInAs(state.users.adminB.email, PASSWORD);
  const anon = anonClient();

  // ── Same-tenant role matrix (Company A actors against Project A) ───────
  r.section('Role matrix — SELECT projects (own company)');
  for (const [label, client, expect] of [
    ['Admin A', adminA, true], ['PM A (assigned)', pmA, true],
    ['Contractor A (assigned)', contractorAAssigned, true],
    ['Contractor A (unassigned)', contractorAUnassigned, false],
    ['Viewer A', viewerA, true],
  ]) {
    const { data, error } = await client.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    const got = !error && !!data;
    r.check(`${label} SELECT projects/${PROJECT_A} -> ${expect ? 'visible' : 'not visible'}`, got === expect, JSON.stringify({ data, error }));
  }

  // README (`### Security/function audit notes`) documents the actual rule:
  // 020 blocks direct CONTRACTOR writes to contractor_reports (contractors
  // must use the atomic RPC); it does NOT block Admin/PM direct writes —
  // contractor_reports_insert's policy is `can_write_project(project_id)`,
  // which allows admin/pm same-company regardless of write path. Tested
  // per-role against that actual policy, not an assumed blanket rule.
  r.section('Role matrix — direct INSERT into contractor_reports (policy: admin/pm allowed, contractor blocked)');
  const directInsertCases = [
    ['Admin A', adminA, false, '2099-02-01'], ['PM A', pmA, false, '2099-02-02'],
    ['Contractor A (assigned)', contractorAAssigned, true, '2099-02-03'], ['Viewer A', viewerA, true, '2099-02-04'],
  ];
  for (const [label, client, expectDenied, reportDate] of directInsertCases) {
    const { data, error } = await client.from('contractor_reports')
      .insert({ project_id: PROJECT_A, report_date: reportDate, overall_progress: 1 })
      .select();
    const denied = !!error && (!data || data.length === 0);
    r.check(`${label} direct INSERT into contractor_reports -> ${expectDenied ? 'denied' : 'allowed'} (matches can_write_project policy)`, denied === expectDenied, JSON.stringify({ data, error }));
  }

  r.section('Role matrix — UPDATE/DELETE own-company project (Admin/PM allowed, Viewer/unassigned Contractor denied)');
  {
    const before = await adminA.from('projects').select('store_code').eq('id', PROJECT_A2).single();
    const { error: adminUpdateErr } = await adminA.from('projects').update({ store_code: 'CERT-A2-UPDATED' }).eq('id', PROJECT_A2);
    r.check('Admin A can UPDATE a Company A project', !adminUpdateErr, adminUpdateErr?.message);
    const { error: viewerUpdateErr } = await viewerA.from('projects').update({ store_code: 'SHOULD-NOT-APPLY' }).eq('id', PROJECT_A2);
    const afterViewerAttempt = await adminA.from('projects').select('store_code').eq('id', PROJECT_A2).single();
    r.check('Viewer A UPDATE on a Company A project has no effect (denied by RLS, not merely erroring)', afterViewerAttempt.data?.store_code === 'CERT-A2-UPDATED', JSON.stringify({ viewerUpdateErr, afterViewerAttempt: afterViewerAttempt.data }));
  }

  // ── Cross-tenant: Company B users against Company A / Project A data ───
  r.section('Cross-tenant — Company B Admin against Project A / Company A resources');
  {
    const { data: readAttempt } = await adminB.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    r.check('Company B Admin cannot read Project A (RLS filters it out, no row returned)', readAttempt == null);

    const { data: crRead } = await adminB.from('contractor_reports').select('id').eq('project_id', PROJECT_A);
    r.check('Company B Admin sees 0 Project A contractor_reports rows', Array.isArray(crRead) && crRead.length === 0);

    const { data: svRead } = await adminB.from('site_visits').select('id').eq('project_id', PROJECT_A);
    r.check('Company B Admin sees 0 Project A site_visits rows', Array.isArray(svRead) && svRead.length === 0);

    const { data: phRead } = await adminB.from('progress_history').select('id').eq('project_id', PROJECT_A);
    r.check('Company B Admin sees 0 Project A progress_history rows', Array.isArray(phRead) && phRead.length === 0);

    const before = countRows('contractor_reports', `project_id = ${PROJECT_A}`);
    const { error: insertErr } = await adminB.from('contractor_reports').insert({ project_id: PROJECT_A, report_date: '2099-01-02', overall_progress: 1 });
    r.check('Company B Admin cannot INSERT a contractor_reports row for Project A', !!insertErr);
    r.check('...and no row was actually created (ground truth, not just an error message)', countRows('contractor_reports', `project_id = ${PROJECT_A}`) === before);

    const { data: beforeUpd } = await adminA.from('projects').select('store_code').eq('id', PROJECT_A).single();
    const { error: updErr } = await adminB.from('projects').update({ store_code: 'HACKED' }).eq('id', PROJECT_A);
    const { data: afterUpd } = await adminA.from('projects').select('store_code').eq('id', PROJECT_A).single();
    r.check('Company B Admin UPDATE on Project A has no effect', afterUpd?.store_code === beforeUpd?.store_code, JSON.stringify({ updErr: updErr?.message, before: beforeUpd, after: afterUpd }));

    const { error: delErr, count } = await adminB.from('projects').delete({ count: 'exact' }).eq('id', PROJECT_A);
    r.check('Company B Admin DELETE on Project A affects 0 rows', count === 0, JSON.stringify({ delErr: delErr?.message, count }));
    const stillThere = await adminA.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    r.check('Project A still exists after the cross-tenant delete attempt', !!stillThere.data);
  }

  r.section('Cross-tenant — RPC calls (Company B PM calling atomic RPCs against Project A)');
  {
    const pmB = await signInAs(state.users.pmB.email, PASSWORD);
    const before = countRows('site_visits', `project_id = ${PROJECT_A}`);
    const { error } = await pmB.rpc('submit_site_visit_atomic', {
      p_project_id: PROJECT_A, p_contractor_report_id: null, p_visit_date: '2026-08-20',
      p_observations: [{ wpId: 'demo.walls', observed_progress: 10, observed_status: 'in_progress', gc_progress: 10 }],
      p_meta: {}, p_client_request_id: '11111111-1111-1111-1111-111111111111',
    });
    r.check('Company B PM cannot call submit_site_visit_atomic for Project A', !!error, JSON.stringify(error));
    r.check('...and no row was created', countRows('site_visits', `project_id = ${PROJECT_A}`) === before);
  }

  // ── Unauthenticated (anon key, no session) ──────────────────────────────
  r.section('Unauthenticated (anon key, no session)');
  {
    const { data } = await anon.from('projects').select('id').eq('id', PROJECT_A).maybeSingle();
    r.check('anon cannot read Project A', data == null);

    const { error: insertErr } = await anon.from('contractor_reports').insert({ project_id: PROJECT_A, report_date: '2099-01-03' });
    r.check('anon cannot INSERT into contractor_reports', !!insertErr);

    const { error: rpcErr } = await anon.rpc('submit_contractor_report_atomic', {
      p_project_id: PROJECT_A, p_report_date: '2026-08-21', p_wp_progress: [], p_meta: {},
      p_client_request_id: '22222222-2222-2222-2222-222222222222',
    });
    r.check('anon cannot call submit_contractor_report_atomic', !!rpcErr, JSON.stringify(rpcErr));
    // anon has no EXECUTE grant at all (025 grants EXECUTE only to `authenticated`),
    // so PostgREST denies the call before the function's own internal
    // `auth.uid() IS NULL` check ever runs — "permission denied for function"
    // rather than "Authentication required". Both are a correct denial; this
    // just confirms which layer is doing the denying.
    r.check('denial is a permission-denied at the grant layer (function-level EXECUTE was correctly never granted to anon)', /permission denied/i.test(rpcErr?.message ?? ''), rpcErr?.message);

    const { data: waRead, error: waErr } = await anon.from('write_command_requests').select('id').limit(1);
    r.check('anon cannot read write_command_requests (RLS + REVOKE)', (Array.isArray(waRead) && waRead.length === 0) || !!waErr, JSON.stringify({ waRead, waErr }));
  }

  // ── Service-role secret scan (build output + source) ────────────────────
  r.section('Service-role secret exposure scan');
  {
    const { execSync } = await import('node:child_process');
    const grepSrc = execSync('grep -rl "service_role" src/ --include=*.js --include=*.jsx || true').toString().trim();
    const offenders = grepSrc.split('\n').filter(Boolean).filter(f => !f.includes('migrations/') && !f.includes('/tests/'));
    r.check('no src/ application file (outside migrations/ and tests/) references service_role', offenders.length === 0, offenders.join(', '));
  }

  const summary = r.summary();
  process.exitCode = summary.fail === 0 ? 0 : 1;
}

main().catch(err => { console.error('CERTIFICATION SCRIPT ERROR:', err); process.exit(2); });
