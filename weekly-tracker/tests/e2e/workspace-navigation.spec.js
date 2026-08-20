import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { getLocalFixturePassword } from '../../scripts/certification/fixturePassword.mjs';
import { assertLocalTarget } from '../../scripts/certification/localTargetGuard.mjs';
import { login } from './helpers.js';

const password = getLocalFixturePassword();
const localTarget = assertLocalTarget({
  apiUrl: process.env.VITE_SUPABASE_URL,
  dbUrl: process.env.CERT_DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});
const psqlBin = process.platform === 'win32'
  ? 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
  : 'psql';
let createdSubscription = false;

function psql(sql, tuplesOnly = false) {
  return execFileSync(psqlBin, [localTarget.dbUrl, '-X', '-v', 'ON_ERROR_STOP=1',
    ...(tuplesOnly ? ['-t', '-A'] : []), '-c', sql], { encoding: 'utf8' }).trim();
}

test.beforeAll(() => {
  const existing = psql("select count(*) from public.organization_subscriptions subscription join public.organizations organization_row on organization_row.id=subscription.organization_id where organization_row.legacy_company_id='company-a';", true);
  createdSubscription = existing === '0';
  if (createdSubscription) psql("insert into public.organization_subscriptions(organization_id,plan_id,status,starts_at) select id,'owner','ACTIVE','2026-08-01'::timestamptz from public.organizations where legacy_company_id='company-a';");
  psql("insert into public.organization_entitlements(organization_id,capability_id,source,enabled,starts_at) select id,'weekly.reports','manual_override',false,'2026-08-01'::timestamptz from public.organizations where legacy_company_id='company-a' on conflict (organization_id,capability_id,source) do update set enabled=false,starts_at=excluded.starts_at,expires_at=null,revision=public.organization_entitlements.revision+1;");
});

test.afterAll(() => {
  psql("delete from public.organization_entitlements entitlement using public.organizations organization_row where entitlement.organization_id=organization_row.id and organization_row.legacy_company_id='company-a' and entitlement.capability_id='weekly.reports' and entitlement.source='manual_override';");
  if (createdSubscription) psql("delete from public.organization_subscriptions subscription using public.organizations organization_row where subscription.organization_id=organization_row.id and organization_row.legacy_company_id='company-a';");
});

test('workspace navigation is capability-driven and remembers the last valid workspace', async ({ page }) => {
  await login(page, { email: 'admin-a@cert.local', password });
  await page.goto('/home');

  await expect(page.getByText('company-a', { exact: true })).toBeVisible();
  const workspace = page.getByLabel('Workspace');
  await expect(workspace).toHaveValue('portfolio');
  await expect(page.getByRole('link', { name: 'Portfolio', exact: true })).toBeVisible();

  await workspace.selectOption('field');
  await expect(page).toHaveURL(/\/site-visit-select$/);
  await expect(page.getByRole('link', { name: 'Site Snag', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portfolio', exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('Workspace')).toHaveValue('field');
});

test('an application Admin cannot open a route disabled by organization entitlement', async ({ page }) => {
  await login(page, { email: 'admin-a@cert.local', password });
  await page.goto('/weekly-reports');
  await expect(page).toHaveURL(/\/unauthorized$/);
});
