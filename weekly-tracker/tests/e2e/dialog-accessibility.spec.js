// Sprint 5 — Phase 2: shared dialog/drawer accessibility (components/shared/Modal.jsx).
// Live, authenticated verification against LOCAL Supabase only — same
// local-only discipline as mobile-field-workflows.spec.js (no direct
// Supabase client in this file, browser-only interaction).

import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

const ADMIN = { email: 'admin-a@cert.local', password: 'Cert-Test-Pass-1!' };

test.describe('Shared dialog primitive (components/shared/Modal.jsx)', () => {
  test('ProjectDetailModal — role/aria-modal, initial focus inside, Escape closes and returns focus to trigger', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'fixture admin has no visible projects — needs fixture check, not a dialog defect');

    const trigger = page.locator('table tbody tr').first().locator('button').first();
    await trigger.click();

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);

    // Initial focus landed somewhere inside the dialog, not left on <body>.
    const focusInsideDialog = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(focusInsideDialog, 'initial focus should move into the dialog on open').toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Focus returned to the element that opened the dialog.
    const triggerFocused = await trigger.evaluate((el) => el === document.activeElement);
    expect(triggerFocused, 'focus should return to the trigger element after the dialog closes').toBeTruthy();
  });

  test('ProjectEditorModal — dirty-state protection blocks silent Escape close', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: 'Add New Project' }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    await dialog.locator('input[name="storeCode"]').fill('E2E-DIALOG-TEST');

    // Dismiss the native confirm() dialog (choose "Cancel" = stay open, don't discard).
    let dialogSeen = false;
    page.once('dialog', async (d) => {
      dialogSeen = true;
      expect(d.type()).toBe('confirm');
      await d.dismiss();
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    expect(dialogSeen, 'Escape on a dirty form should trigger a confirm prompt, not close silently').toBeTruthy();
    await expect(dialog, 'dialog should remain open after the confirm prompt was dismissed').toBeVisible();
    await expect(dialog.locator('input[name="storeCode"]')).toHaveValue('E2E-DIALOG-TEST');

    // Now accept the confirm — dialog should actually close.
    page.once('dialog', (d) => d.accept());
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('ProjectEditorModal — Tab from the last focusable element wraps to the first (focus containment)', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: 'Add New Project' }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    // "Cancel" is the modal's last focusable control (before "Create Project",
    // which is disabled/not the tab target in this simple check) — jump focus
    // to the true last element in DOM order and confirm Tab wraps to the first.
    const focusables = dialog.locator(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const count = await focusables.count();
    expect(count).toBeGreaterThan(1);

    await focusables.last().focus();
    await page.keyboard.press('Tab');

    const firstFocused = await focusables.first().evaluate((el) => el === document.activeElement);
    expect(firstFocused, 'Tab from the last focusable element should wrap to the first, not escape the dialog').toBeTruthy();

    // Close without triggering the dirty-state prompt (no edits were made).
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.keyboard.press('Escape');
  });
});
