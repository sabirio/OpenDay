import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { login } from './helpers.js';

const ADMIN = { email: 'admin-a@cert.local', password: 'Cert-Test-Pass-1!' };
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

test.setTimeout(120_000);

async function fillRequiredProjectFields(dialog, storeCode, city) {
  await dialog.locator('[name="storeCode"]').fill(storeCode);
  await dialog.locator('[name="country"]').fill('Local Test');
  await dialog.locator('[name="city"]').fill(city);
  await dialog.locator('[name="constructionStartDate"]').fill('2026-08-01');
  await dialog.locator('[name="constructionEndDate"]').fill('2026-10-31');
  await dialog.locator('[name="targetOpeningDate"]').fill('2026-11-15');
  await dialog.locator('[name="storeSizeSqm"]').fill('1200');
  await dialog.locator('[name="salesAreaSqm"]').fill('850');
  await dialog.locator('[name="backOfHouseAreaSqm"]').fill('180');
}

async function waitForProject(client, storeCode) {
  return expect.poll(async () => {
    const { data } = await client
      .from('projects')
      .select('id,template_type,template_id,scope')
      .eq('store_code', storeCode)
      .maybeSingle();
    return data;
  }).not.toBeNull();
}

test('new projects use one unified scope entry and preserve pinned/default semantics', async ({ page }) => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const simpleCode = `SCOPE-SIMPLE-${runId}`;
  const configuredCode = `SCOPE-CONFIG-${runId}`;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword(ADMIN);
  expect(signInError).toBeNull();

  const createdIds = [];
  try {
    await login(page, ADMIN);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Add New Project' }).click();
    let editor = page.getByRole('dialog').first();
    await expect(editor).toBeVisible();

    await expect(editor.getByText('91 work packages selected')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Configure Project Scope' })).toBeVisible();
    for (const technicalChoice of [
      'Standard (with Demolition)',
      'Standard (New Space)',
      'Retail Fit-Out (Zoned)',
      'Custom',
    ]) {
      await expect(editor.getByText(technicalChoice, { exact: false })).toHaveCount(0);
    }

    await fillRequiredProjectFields(editor, simpleCode, 'Simple Create');
    await expect(editor.locator('.project-scope-entry-summary'))
      .toContainText('Sales 850 m² · Back of House 180 m²');
    await editor.getByRole('button', { name: 'Create Project' }).click();
    await expect(editor).toBeHidden();

    await waitForProject(client, simpleCode);
    const { data: simpleProject } = await client
      .from('projects')
      .select('id,template_type,template_id,scope')
      .eq('store_code', simpleCode)
      .single();
    createdIds.push(simpleProject.id);
    expect(simpleProject.template_type).toBe('retail-fitout-v2');
    expect(simpleProject.template_id).toBeTruthy();
    expect(simpleProject.scope).toBeNull();

    const { count: simpleTaskCount } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', simpleProject.id);
    expect(simpleTaskCount).toBe(91);

    const { data: pinnedTemplateBefore } = await client
      .from('templates')
      .select('data')
      .eq('id', simpleProject.template_id)
      .single();
    const templateBefore = JSON.stringify(pinnedTemplateBefore.data);

    await page.getByRole('button', { name: 'Add New Project' }).click();
    editor = page.getByRole('dialog').first();
    await fillRequiredProjectFields(editor, configuredCode, 'Configured Create');
    await editor.getByRole('button', { name: 'Configure Project Scope' }).click();

    const configurator = page.getByRole('dialog').last();
    await expect(configurator.getByText('Configure Project Scope')).toBeVisible();
    await expect(configurator.locator('.project-scope-area-context'))
      .toContainText(/Sales Area\s*850 m²/);
    await configurator.getByText('Demolition', { exact: true }).click();
    await configurator.locator('label', { hasText: 'Strip Out & Clear' }).locator('input').uncheck();
    await expect(configurator.locator('.project-scope-configurator-footer'))
      .toContainText('90 work packages');
    await configurator.getByRole('button', { name: 'Save Scope' }).click();
    await expect(editor.getByText('90 work packages selected')).toBeVisible();
    await editor.getByRole('button', { name: 'Create Project' }).click();
    await expect(editor).toBeHidden();

    await waitForProject(client, configuredCode);
    const { data: configuredProject } = await client
      .from('projects')
      .select('id,template_id,scope')
      .eq('store_code', configuredCode)
      .single();
    createdIds.push(configuredProject.id);
    expect(configuredProject.template_id).toBe(simpleProject.template_id);
    expect(configuredProject.scope.workPackages).toHaveLength(90);

    const { count: configuredTaskCount } = await client
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', configuredProject.id);
    expect(configuredTaskCount).toBe(90);

    const { data: pinnedTemplateAfter } = await client
      .from('templates')
      .select('data')
      .eq('id', configuredProject.template_id)
      .single();
    expect(JSON.stringify(pinnedTemplateAfter.data)).toBe(templateBefore);

    await page.getByText(configuredCode, { exact: true }).click();
    await page.getByRole('button', { name: 'Edit Project' }).click();
    const pinnedEditor = page.getByRole('dialog').first();
    await expect(pinnedEditor.getByText('90 work packages selected')).toBeVisible();
    await expect(pinnedEditor.getByRole('button', { name: 'Configure Project Scope' })).toBeVisible();
    await expect(pinnedEditor.getByText('Retail Fit-Out (Zoned)', { exact: false })).toHaveCount(0);
  } finally {
    for (const projectId of createdIds) {
      await client.from('project_gantt_tasks').delete().eq('project_id', projectId);
      await client.from('projects').delete().eq('id', projectId);
    }
  }
});
