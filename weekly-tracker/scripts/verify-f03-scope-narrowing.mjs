/**
 * verify-f03-scope-narrowing.mjs — live regression proof for F-03.
 *
 * Run manually (not part of `npm run test` — needs a running dev server on
 * :5173, SUPABASE_SERVICE_ROLE_KEY in .env.local, and the E2E admin account
 * seeded via scripts/seed-test-users.mjs):
 *
 *   npm run dev &            (or use an already-running instance)
 *   node scripts/verify-f03-scope-narrowing.mjs
 *
 * What it proves, against the real (test) Supabase project, via the real
 * app UI (Playwright drives the actual ProjectEditorModal/ZonedScopeConfigurator
 * save flow — the exact code path a real PM uses):
 *   1. Generate a v2 project's Gantt with full scope -> every WP active
 *      (is_archived = false).
 *   2. Narrow scope (deselect the Sales Floor zone) and save -> that zone's
 *      WPs are archived (is_archived = true), a real regenerateGantt() call.
 *   3. Widen scope back to full and save again -> those same WPs are
 *      un-archived, with NO duplicate (project_id, wp_id) rows created.
 *   4. Cleans up the disposable test project afterward.
 *
 * Verification reads go straight to Postgres via the service-role key
 * (bypassing RLS, read *and* write only against this script's own disposable
 * test project — never touches any other project's data).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadDotEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf-8').split('\n')
        .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
        .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; })
    );
  } catch { return {}; }
}
const env = loadDotEnv(new URL('../.env.local', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const BASE = 'http://localhost:5173';
const ADMIN_CREDS = { email: 'admin@openday.fit', password: 'Admin' };

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

async function ganttRows(projectId) {
  const { data, error } = await admin.from('project_gantt_tasks').select('wp_id, is_archived').eq('project_id', projectId);
  if (error) throw error;
  return data;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
let projectDbId = null;

try {
  await page.goto(`${BASE}/login`);
  await page.locator('#email').fill(ADMIN_CREDS.email);
  await page.locator('#password').fill(ADMIN_CREDS.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });

  const storeCode = `F03-VERIFY-${Date.now()}`;
  await page.goto(`${BASE}/projects`);
  await page.getByRole('button', { name: /Add New Project/i }).click();
  await page.waitForTimeout(300);
  await page.getByText('Retail Fit-Out (Zoned)', { exact: false }).click();
  await page.waitForTimeout(300);
  await page.locator('input[name="storeCode"]').fill(storeCode);
  await page.locator('input[name="shoppingMallName"]').fill('F03 Verify Mall');
  await page.locator('input[name="city"]').fill('Almaty');
  await page.locator('input[name="country"]').fill('Kazakhstan');
  await page.locator('input[name="scope.zoneAreas.sales"]').fill('700');
  await page.locator('input[name="scope.zoneAreas.boh"]').fill('300');
  await page.locator('input[name="constructionStartDate"]').fill('2026-08-01');
  await page.locator('input[name="targetOpeningDate"]').fill('2027-02-01');
  await page.getByRole('button', { name: /Create Project/i }).click();
  await page.waitForTimeout(2000);

  const { data: proj } = await admin.from('projects').select('id').eq('store_code', storeCode).single();
  projectDbId = proj.id;
  console.log(`Created test project id=${projectDbId} (${storeCode})`);

  // ── Step 1: full scope -> everything active ────────────────────────────
  let rows = await ganttRows(projectDbId);
  const salesRowsInitial = rows.filter(r => r.wp_id.startsWith('sales.'));
  check('full scope: project has 91 gantt rows seeded', rows.length === 91);
  check('full scope: no rows archived yet', rows.every(r => r.is_archived === false));
  check('full scope: Sales zone has 33 WPs (sanity)', salesRowsInitial.length === 33);

  // ── Step 2: narrow scope (deselect Sales Floor), save -> archived ──────
  await page.goto(`${BASE}/projects`);
  await page.waitForTimeout(800);
  const testRow = page.locator('tr', { hasText: storeCode });
  await testRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Configure Scope|Scope configured/i }).click();
  await page.waitForTimeout(500);
  // Scoped to the topmost (last-mounted) "Sales Floor" label — the scope
  // configurator overlay is mounted after (and on top of) the background
  // ProjectEditorModal, which also has an unrelated "Sales Floor Area" field
  // label; .last() picks the configurator's own zone-header span, and the
  // checkbox is its immediate preceding sibling in the same row.
  const salesLabel = page.locator('span', { hasText: 'Sales Floor' }).last();
  await salesLabel.locator('xpath=preceding-sibling::input[@type="checkbox"]').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Save Scope' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForTimeout(2000);

  rows = await ganttRows(projectDbId);
  const salesRowsAfterNarrow = rows.filter(r => r.wp_id.startsWith('sales.'));
  check('narrowed scope: Sales-zone rows still exist (soft-archived, not deleted)', salesRowsAfterNarrow.length === 33);
  check('narrowed scope: Sales-zone rows are now archived', salesRowsAfterNarrow.every(r => r.is_archived === true));
  check('narrowed scope: non-Sales rows remain active', rows.filter(r => !r.wp_id.startsWith('sales.')).every(r => r.is_archived === false));
  check('narrowed scope: total row count unchanged (soft-archive, no delete)', rows.length === 91);

  // ── Step 3: widen scope back to full, save -> un-archived, no dupes ────
  await page.goto(`${BASE}/projects`);
  await page.waitForTimeout(800);
  const testRow2 = page.locator('tr', { hasText: storeCode });
  await testRow2.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Configure Scope|Scope configured/i }).click();
  await page.waitForTimeout(500);
  const salesLabel2 = page.locator('span', { hasText: 'Sales Floor' }).last();
  await salesLabel2.locator('xpath=preceding-sibling::input[@type="checkbox"]').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Save Scope' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForTimeout(2000);

  rows = await ganttRows(projectDbId);
  const uniqueWpIds = new Set(rows.map(r => r.wp_id));
  check('widened scope: no duplicate (project_id, wp_id) rows created', uniqueWpIds.size === rows.length);
  check('widened scope: total row count still 91 (no dupes, no orphan growth)', rows.length === 91);
  check('widened scope: Sales-zone rows are un-archived again', rows.filter(r => r.wp_id.startsWith('sales.')).every(r => r.is_archived === false));
  check('widened scope: every row is active again', rows.every(r => r.is_archived === false));

  console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
} catch (err) {
  console.error('SCRIPT FAILURE:', err.message);
  fail++;
} finally {
  if (projectDbId) {
    await admin.from('project_gantt_tasks').delete().eq('project_id', projectDbId);
    await admin.from('projects').delete().eq('id', projectDbId);
    console.log(`Cleaned up test project id=${projectDbId}`);
  }
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}
