/**
 * Full E2E seed — TEST_01_e2e & TEST_02_e2e
 *
 * Strategy:
 *   - Project creation + site visits: Playwright request context (Node.js side, no CORS)
 *   - Contractor reports: browser UI (5 per project)
 *   - State (project IDs) persisted to a temp file on disk so it survives
 *     module re-imports that happen when Playwright restarts after test timeouts.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { CREDENTIALS, login, logout } from './helpers.js';
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or E2E_SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY in env — check .env.local');
}

// Temp file keeps project IDs across module re-imports / Playwright restarts
const STATE_FILE = path.join(os.tmpdir(), 'e2e-seed-23-state.json');

// 1×1 transparent PNG — satisfies the "at least one photo" validation
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

// Dates for the 5 weekly reports (each 7 days apart)
const REPORT_DATES = [
  '2025-03-03', '2025-03-10', '2025-03-17', '2025-03-24', '2025-03-31',
];

// ── Disk-state helpers ───────────────────────────────────────────────────────

function saveState(obj) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(obj), 'utf8');
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

// ── Supabase Node.js helpers ─────────────────────────────────────────────────

async function sbAuth(ctx) {
  const res = await ctx.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    data:    { email: CREDENTIALS.admin.email, password: CREDENTIALS.admin.password },
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`Auth failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

function dbHeaders(jwt) {
  return {
    apikey:         SUPABASE_ANON_KEY,
    Authorization:  `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation',
  };
}

async function sbInsert(ctx, jwt, table, row) {
  const res  = await ctx.post(`${SUPABASE_URL}/rest/v1/${table}`, { data: row, headers: dbHeaders(jwt) });
  const body = await res.json();
  if (!Array.isArray(body) || body.length === 0)
    throw new Error(`Insert ${table} failed (${res.status()}): ${JSON.stringify(body)}`);
  return body[0];
}

async function sbSelect(ctx, jwt, table, filter, order = null) {
  const q    = Object.entries(filter).map(([k, v]) => `${k}=eq.${v}`).join('&');
  const ord  = order ? `&order=${order}` : '';
  const res  = await ctx.get(`${SUPABASE_URL}/rest/v1/${table}?${q}${ord}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

async function sbDelete(ctx, jwt, table, filter) {
  const q = Object.entries(filter).map(([k, v]) => `${k}=eq.${v}`).join('&');
  await ctx.delete(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
    headers: { ...dbHeaders(jwt), Prefer: 'return=minimal' },
  });
}

// ── Browser helper: submit one contractor report via the form ─────────────────

async function submitContractorReportViaUI(page, projectId, reportDate, weekIndex) {
  await login(page, CREDENTIALS.admin);
  await page.goto(`/contractor-report/${projectId}`);

  // Wait for the form wrapper (appears before Gantt loading finishes)
  await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible({ timeout: 15_000 });

  // If Gantt tasks exist → sliders are shown; otherwise WP toggles appear.
  // For API-created projects (no gantt_generated_at set), getProjectGantt returns [].
  // Wait for the spinner "Loading schedule…" to disappear.
  await page.waitForFunction(() => {
    return !document.body.innerText.includes('Loading schedule');
  }, { timeout: 15_000 });

  // Set reporting date
  await page.locator('[data-testid="reporting-date"]').fill(reportDate);

  // Schedule Status: On Track (default, but click explicitly)
  await page.locator('[data-testid="toggle-schedule-status-On Track"]').click();

  // Client Support: No (default)
  await page.locator('[data-testid="toggle-support-required-No"]').click();

  // Additional Works: No (default)
  await page.locator('[data-testid="toggle-additional-works-No"]').click();

  // Activities Blocked: No (default)
  await page.locator('[data-testid="toggle-activities-blocked-No"]').click();

  // Fill the 4 visible textareas in order:
  //   0 = Next Week Top 3, 1 = Week+2 Top 3, 2 = Pending Issues, 3 = Final Comments
  const textareas = page.locator('textarea');
  await textareas.nth(0).fill(`1) E2E site prep week ${weekIndex + 1}\n2) E2E structural works\n3) E2E MEP roughing`);
  await textareas.nth(1).fill(`1) E2E finishes start\n2) E2E equipment delivery\n3) E2E snagging prep`);
  await textareas.nth(2).fill(`E2E pending: awaiting delivery confirmation — week ${weekIndex + 1}`);
  await textareas.nth(3).fill(`E2E auto-report #${weekIndex + 1} — ${reportDate}`);

  // Upload a minimal photo (required by validation)
  await page.locator('input[type="file"]').setInputFiles({
    name:     'site-photo.png',
    mimeType: 'image/png',
    buffer:   TINY_PNG,
  });

  // Declaration checkbox
  await page.locator('[data-testid="declaration-checkbox"]').click();

  // Submit — wait out the photo's async compress+upload first. Submit stays
  // disabled while it's in flight; clicking mid-upload would fail the "at least
  // one photo" validation despite the thumbnail already being visible (the
  // parent's photoUrls state only updates once the upload resolves).
  await expect(page.locator('[data-testid="save-contractor-report"]')).toBeEnabled({ timeout: 30_000 });
  await page.locator('[data-testid="save-contractor-report"]').click();

  // Wait for the success screen
  await expect(page.getByText('Report submitted')).toBeVisible({ timeout: 30_000 });

  // The success screen has no nav bar, so navigate home before logging out
  await page.goto('/');
  await logout(page);
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('E2E seed — TEST_01_e2e & TEST_02_e2e', () => {

  // ── Test 1: create projects via API, write IDs to disk ────────────────────

  test('Step 01 — create projects via Supabase API', async () => {
    const ctx = await playwrightRequest.newContext();
    const jwt = await sbAuth(ctx);

    // Remove any stale test data from previous runs
    for (const code of ['TEST_01_e2e', 'TEST_02_e2e']) {
      const rows = await sbSelect(ctx, jwt, 'projects', { store_code: code }).catch(() => []);
      for (const p of (rows || [])) await sbDelete(ctx, jwt, 'projects', { id: p.id }).catch(() => {});
    }

    const p1 = await sbInsert(ctx, jwt, 'projects', {
      store_code: 'TEST_01_e2e', shopping_mall_name: 'E2E Mall Alpha',
      city: 'Stockholm', country: 'Sweden',
      general_contractor: 'E2E GC Alpha', project_manager: 'E2E PM',
      construction_start_date: '2025-01-06', construction_end_date: '2025-09-30',
      target_opening_date: '2025-10-15', project_type: 'New Opening',
      project_status: 'Active', store_size_sqm: 800,
    });

    const p2 = await sbInsert(ctx, jwt, 'projects', {
      store_code: 'TEST_02_e2e', shopping_mall_name: 'E2E Mall Beta',
      city: 'Oslo', country: 'Norway',
      general_contractor: 'E2E GC Beta', project_manager: 'E2E PM',
      construction_start_date: '2025-02-03', construction_end_date: '2025-10-31',
      target_opening_date: '2025-11-15', project_type: 'New Opening',
      project_status: 'Active', store_size_sqm: 950,
    });

    await ctx.dispose();

    saveState({ project1Id: p1.id, project2Id: p2.id });
    expect(p1.id).toBeTruthy();
    expect(p2.id).toBeTruthy();
    console.log(`Created: p1=${p1.id} (TEST_01_e2e), p2=${p2.id} (TEST_02_e2e)`);
  });

  // ── Tests 2–6: 5 contractor reports for TEST_01_e2e via browser UI ────────

  for (let i = 0; i < REPORT_DATES.length; i++) {
    test(`Step 0${i + 2} — submit contractor report ${i + 1}/5 for TEST_01_e2e (${REPORT_DATES[i]})`, async ({ page }) => {
      const { project1Id } = loadState();
      expect(project1Id, 'Step 01 must run first').toBeTruthy();
      await submitContractorReportViaUI(page, project1Id, REPORT_DATES[i], i);
    });
  }

  // ── Tests 7–11: 5 contractor reports for TEST_02_e2e via browser UI ───────

  for (let i = 0; i < REPORT_DATES.length; i++) {
    test(`Step ${i + 7 < 10 ? '0' : ''}${i + 7} — submit contractor report ${i + 1}/5 for TEST_02_e2e (${REPORT_DATES[i]})`, async ({ page }) => {
      const { project2Id } = loadState();
      expect(project2Id, 'Step 01 must run first').toBeTruthy();
      await submitContractorReportViaUI(page, project2Id, REPORT_DATES[i], i);
    });
  }

  // ── Test 12: seed site visits via API (2 per project) ────────────────────

  test('Step 12 — seed site visits via Supabase API', async () => {
    const { project1Id, project2Id } = loadState();
    expect(project1Id, 'Step 01 must run first').toBeTruthy();

    const ctx = await playwrightRequest.newContext();
    const jwt = await sbAuth(ctx);

    // UI-submitted reports (legacy path without Gantt tasks) write to the `reports` table,
    // not `contractor_reports`. Site visits are created without a contractor_report_id FK
    // and use hardcoded WP observations (matching the legacy site-visit creation path).
    const WP_OBSERVATIONS = [
      { wp_id: 'demolition',    gc_status: 'completed',   gc_prog: 100, pm_status_v2: 'delayed' },
      { wp_id: 'construction',  gc_status: 'in_progress', gc_prog: 60,  pm_status_v2: 'in_progress' },
      { wp_id: 'mep',           gc_status: 'in_progress', gc_prog: 40,  pm_status_v2: 'in_progress' },
      { wp_id: 'finishes',      gc_status: 'not_started', gc_prog: 0,   pm_status_v2: 'not_started' },
    ];

    for (const [projectId, label] of [[project1Id, 'p1'], [project2Id, 'p2']]) {
      for (let v = 0; v < 2; v++) {
        const visitDate = new Date('2025-05-05');
        visitDate.setDate(visitDate.getDate() + (label === 'p2' ? 30 : 0) + v * 14);

        // No contractor_report_id — legacy path omits this FK to avoid violations
        const sv = await sbInsert(ctx, jwt, 'site_visits', {
          project_id:             projectId,
          visit_date:             visitDate.toISOString().split('T')[0],
          overall_note:           `E2E site visit ${v + 1} — ${label}`,
          pm_schedule_assessment: v === 0 ? 'On Track' : 'At Risk',
        });

        for (const obs of WP_OBSERVATIONS) {
          // Second visit: mark first WP as delayed to produce a discrepancy
          const pmStatus    = (v === 1 && obs.wp_id === 'demolition') ? obs.pm_status_v2 : obs.gc_status;
          const pmProg      = (v === 1 && obs.wp_id === 'demolition') ? Math.max(0, obs.gc_prog - 10) : obs.gc_prog;
          const gcRank      = { completed: 2, in_progress: 1, not_started: 0, delayed: -1, blocked: -2 }[obs.gc_status] ?? 0;
          const pmRank      = { completed: 2, in_progress: 1, not_started: 0, delayed: -1, blocked: -2 }[pmStatus]  ?? 0;
          const rankDelta   = pmRank - gcRank;
          const signedDelta = rankDelta !== 0 ? rankDelta * 10 : (pmProg - obs.gc_prog);
          const absDelta    = Math.abs(signedDelta);
          await sbInsert(ctx, jwt, 'site_visit_wps', {
            site_visit_id:      sv.id,
            project_id:         projectId,
            wp_id:              obs.wp_id,
            observed_progress:  pmProg,
            observed_status:    pmStatus,
            pm_note:            `E2E obs visit ${v + 1}`,
            discrepancy_status: absDelta >= 20 ? 'critical' : absDelta >= 10 ? 'warning' : 'ok',
            discrepancy_delta:  signedDelta,
            gc_status:          obs.gc_status,
          });
        }
      }
    }

    await ctx.dispose();
    console.log('Site visits seeded: 2 per project');
  });

  // ── Tests 13–15: browser verifications ───────────────────────────────────

  test('Step 13 — both projects visible on /projects', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('TEST_01_e2e').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('TEST_02_e2e').first()).toBeVisible({ timeout: 5_000 });
    await logout(page);
  });

  test('Step 14 — both projects visible on Dashboard with contractor reports', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('TEST_01_e2e').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('TEST_02_e2e').first()).toBeVisible({ timeout: 5_000 });
    await logout(page);
  });

  test('Step 15 — Dashboard drawer shows PM site visit card', async ({ page }) => {
    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const row = page.locator('tr, [data-testid="dashboard-project-row"]').filter({ hasText: 'TEST_01_e2e' }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-testid="pm-site-visit-summary"]').first()).toBeVisible({ timeout: 8_000 });

    const discCell = page.locator('[data-testid="discrepancy-count"]').first();
    if (await discCell.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const num = parseInt((await discCell.innerText()).trim());
      expect(isNaN(num), 'discrepancy count should be a number').toBe(false);
    }

    await logout(page);
  });

  // ── Test 16: cleanup ──────────────────────────────────────────────────────

  test('Step 16 — cleanup: delete test projects', async () => {
    const { project1Id, project2Id } = loadState();
    const ctx = await playwrightRequest.newContext();
    try {
      const jwt = await sbAuth(ctx);
      if (project1Id) await sbDelete(ctx, jwt, 'projects', { id: project1Id });
      if (project2Id) await sbDelete(ctx, jwt, 'projects', { id: project2Id });
      fs.unlinkSync(STATE_FILE);
      console.log('Cleanup complete');
    } catch (e) {
      console.warn('Cleanup warning (non-fatal):', e.message);
    }
    await ctx.dispose();
  });
});
