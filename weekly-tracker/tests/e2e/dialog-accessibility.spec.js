// Sprint 5 — Phase 2: shared dialog/drawer accessibility (components/shared/Modal.jsx).
// Live, authenticated verification against LOCAL Supabase only — same
// local-only discipline as mobile-field-workflows.spec.js (no direct
// Supabase client in this file, browser-only interaction).

import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

const ADMIN = { email: 'admin-a@cert.local', password: 'Cert-Test-Pass-1!' };

test.describe('Shared dialog primitive (components/shared/Modal.jsx)', () => {
  test('ProjectEditorModal (opened from the Portfolio details pane) — role/aria-modal, initial focus inside, Escape closes and returns focus to trigger', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    const rowCount = await page.getByTestId('portfolio-master-project').count();
    test.skip(rowCount === 0, 'fixture admin has no visible projects — needs fixture check, not a dialog defect');

    // Project details render inline in the Portfolio master-detail workspace
    // (no dialog) — the reachable dialog from there is Edit Project.
    await page.getByTestId('portfolio-master-project').first().click();
    await expect(page.locator('.detail-pane')).toBeVisible();

    const trigger = page.getByRole('button', { name: 'Edit Project' });
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

  test('ProjectEditorModal — continuous typing does not lose focus after each character (Modal focus-effect regression)', async ({ page }) => {
    // Regression for a bug where Modal.jsx's initial-focus useEffect depended
    // on [onClose, isDirty, dirtyMessage] — since ProjectEditorModal's caller
    // passes a fresh inline onClose and a freshly-computed isDirty on every
    // render, and typing a controlled character re-renders the whole chain,
    // the effect re-ran on every keystroke and forcibly refocused the first
    // focusable element in the dialog (the × close button), so only the
    // first character of anything typed ever landed in the field. A .fill()-
    // based test (see the dirty-state test above) cannot catch this — fill()
    // sets the value in one operation without dispatching real per-character
    // key events. This test uses pressSequentially(), which does.
    await login(page, ADMIN);
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    await page.locator('button', { hasText: 'Add New Project' }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    // Field 1: Store Code — visible immediately, no precondition.
    const storeCode = dialog.locator('input[name="storeCode"]');
    await storeCode.click();
    await storeCode.pressSequentially('SE001', { delay: 30 });
    await expect(storeCode, 'every character should land in the same field with no reclick').toHaveValue('SE001');
    const storeCodeStillFocused = await storeCode.evaluate((el) => el === document.activeElement);
    expect(storeCodeStillFocused, 'focus should still be on the Store Code input after continuous typing').toBeTruthy();

    // Field 2: Shopping Mall Name — the exact field named in the reported
    // bug, only rendered after selecting the "Mall" Location Type.
    await dialog.locator('button', { hasText: 'Mall' }).click();
    const mallName = dialog.locator('input[name="shoppingMallName"]');
    await expect(mallName).toBeVisible();
    await mallName.click();
    await mallName.pressSequentially('Mega Center', { delay: 30 });
    await expect(mallName, 'every character should land in the same field with no reclick').toHaveValue('Mega Center');
    const mallNameStillFocused = await mallName.evaluate((el) => el === document.activeElement);
    expect(mallNameStillFocused, 'focus should still be on the Shopping Mall Name input after continuous typing').toBeTruthy();

    // Backspace/delete must also work on the still-focused field (proves the
    // fix didn't just make the *first* keystroke land — deletion exercises a
    // second, different keystroke on an already-non-empty controlled value).
    await mallName.press('Backspace');
    await expect(mallName).toHaveValue('Mega Cente');

    // Field 3: Store Concept — remains a single free-text input after moving
    // into the location/context section for Slice 1.
    const storeConcept = dialog.locator('input[name="storeConcept"]');
    await storeConcept.click();
    await storeConcept.pressSequentially('Flagship', { delay: 30 });
    await expect(storeConcept, 'Store Concept should retain focus through continuous typing').toHaveValue('Flagship');
    const storeConceptStillFocused = await storeConcept.evaluate((el) => el === document.activeElement);
    expect(storeConceptStillFocused, 'focus should still be on Store Concept after continuous typing').toBeTruthy();

    // Close without triggering the dirty-state prompt path (not what this test covers).
    page.once('dialog', (d) => d.dismiss().catch(() => {}));
    await page.keyboard.press('Escape');
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
