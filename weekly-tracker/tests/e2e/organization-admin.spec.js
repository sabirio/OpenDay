import { test, expect } from '@playwright/test';
import { getLocalFixturePassword } from '../../scripts/certification/fixturePassword.mjs';
import { login } from './helpers.js';

const password = getLocalFixturePassword();

test('Organization Admin sees the employee directory and invitation form', async ({ page }) => {
  await login(page, { email: 'admin-a@cert.local', password });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByText(/Project responsibilities remain on each project's Team page/)).toBeVisible();
  await expect(page.locator('.admin-users-table tbody tr').first()).toBeVisible();
  await expect(page.getByText('Contractor project access')).toHaveCount(0);
  await page.getByRole('button', { name: 'Invite colleague' }).click();
  await expect(page.getByRole('heading', { name: 'Invite colleague' })).toBeVisible();
  await expect(page.getByLabel('Operational access')).toBeVisible();
  await expect(page.getByLabel('Organization role')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Invite colleague' })).toHaveCount(0);
});

test('ordinary organization member cannot open Organization Admin users', async ({ page }) => {
  await login(page, { email: 'pm-a-assigned@cert.local', password });
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/unauthorized$/);
  await expect(page.getByText('Users', { exact: true })).toHaveCount(0);
});
