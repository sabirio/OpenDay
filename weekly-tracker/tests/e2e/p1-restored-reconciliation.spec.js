import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { CREDENTIALS, login, logout } from './helpers.js';

test.setTimeout(180_000);
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

test('reconciled restored-production bootstrap, legacy projects, routes, v1 selection and catalog safety', async ({ page }) => {
  const consoleErrors = [];
  const failed = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword(CREDENTIALS.admin);
  expect(signInError).toBeNull();
  const { data: anchors, error: anchorError } = await client.from('projects').select('id,store_code,template_id,scope').in('id', [127, 143]).order('id');
  expect(anchorError).toBeNull();
  expect(anchors.map(x => x.id)).toEqual([127, 143]);

  await login(page, CREDENTIALS.admin);
  await page.goto('/projects');
  await expect(page.locator('h1')).toContainText('Portfolio');
  await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  for (const project of anchors) {
    await page.getByPlaceholder('Search projects...').fill(project.store_code);
    const row = page.locator(`[data-testid="portfolio-master-project"][data-project-id="${project.id}"]`);
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('.detail-pane')).toBeVisible();
    await expect(page.locator('.detail-pane')).toContainText(project.store_code);
  }

  await page.getByRole('button', { name: 'Add New Project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Project' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Configure Project Scope' }).click();
  const scope = page.getByRole('dialog', { name: 'Configure Project Scope' });
  await expect(scope).toBeVisible();
  await expect(scope).toContainText(/91 work packages/i);
  await scope.getByRole('button', { name: 'Cancel' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await logout(page);

  await login(page, CREDENTIALS.contractor);
  await page.goto('/contractor-report/127');
  await expect(page.locator('[data-testid="contractor-report-form"]')).toBeVisible();
  await page.goto('/');
  await logout(page);

  await login(page, CREDENTIALS.pm);
  await page.goto('/site-visit/127');
  await expect(page.locator('[data-testid="pm-site-visit-form"]')).toBeVisible();

  const { data: templates, error: templateError } = await client.from('templates').select('id,data,is_active,family').in('id', [
    'dc92175a-251c-45ab-a4fd-c83c1c668ef4', 'e4ef4d98-5688-4d12-9fca-2d7cded88d29', 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b',
  ]);
  expect(templateError).toBeNull();
  const v1 = templates.find(t => t.id === 'dc92175a-251c-45ab-a4fd-c83c1c668ef4');
  const v2 = templates.find(t => t.id === 'e4ef4d98-5688-4d12-9fca-2d7cded88d29');
  expect(v1.is_active).toBe(true);
  expect(v1.family).toBe('retail-fitout-v2');
  expect(v2.is_active).toBe(false);
  expect(v2.data.defaultScope.workPackageIds).toHaveLength(78);

  const audit = [...consoleErrors, ...failed].join('\n');
  expect(audit).not.toMatch(/templates\.(family|company_id).*does not exist|42703/i);
  expect(failed.filter(x => /\/rest\/v1\/(templates|projects)/.test(x))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
