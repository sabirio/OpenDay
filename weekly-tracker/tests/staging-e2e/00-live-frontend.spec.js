// Staging cloud E2E — Step 1/2 of the user's ordered sequence:
// (1) live verification of the staging frontend, (2) confirm it talks
// ONLY to staging Supabase, never production.
//
// Requires .env.staging sourced into the shell before running (see
// docs/PHASE_9_STAGING_CERTIFICATION.md). Never reads .env.local. The
// Vercel automation bypass secret is read from process.env only — never
// logged, never asserted into a string that could appear in a report.

import { test, expect } from '@playwright/test';

const BYPASS_SECRET = process.env.STAGING_VERCEL_AUTOMATION_BYPASS_SECRET;
const STAGING_SUPABASE_HOST = process.env.STAGING_SUPABASE_HOST;
const PRODUCTION_SUPABASE_REF = 'szgbkeqornkdngoegyso';

if (!BYPASS_SECRET || !STAGING_SUPABASE_HOST) {
  throw new Error('Missing STAGING_VERCEL_AUTOMATION_BYPASS_SECRET or STAGING_SUPABASE_HOST — source .env.staging first.');
}

test.use({
  extraHTTPHeaders: {
    'x-vercel-protection-bypass': BYPASS_SECRET,
    'x-vercel-set-bypass-cookie': 'true',
  },
});

test.describe('Staging frontend — live verification, staging-only network', () => {
  test('login page loads past the SSO wall and only talks to staging Supabase', async ({ page }) => {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    const response = await page.goto('/login', { waitUntil: 'networkidle', timeout: 30_000 });

    expect(response.status(), 'expected the SSO bypass to let this request through, not 401/403').toBeLessThan(400);

    // The page itself must render real login form elements, not a Vercel
    // auth-wall placeholder page.
    await expect(page.locator('#email')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#password')).toBeVisible();

    const supabaseHosts = new Set(
      requests
        .filter((u) => u.includes('.supabase.co'))
        .map((u) => new URL(u).hostname)
    );
    console.log('Distinct Supabase hosts contacted:', [...supabaseHosts].join(', ') || '(none yet — expected before login)');

    for (const host of supabaseHosts) {
      expect(host, `request went to ${host}, which is not the staging host`).toBe(STAGING_SUPABASE_HOST);
      expect(host.includes(PRODUCTION_SUPABASE_REF), 'a request reached the PRODUCTION Supabase ref — must never happen').toBeFalsy();
    }

    expect(errors, `unexpected console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('a login attempt reaches staging Auth (not production) — credentials expected to fail, DB not seeded yet', async ({ page }) => {
    const authRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('.supabase.co') && req.url().includes('/auth/')) authRequests.push(req.url());
    });

    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#email').fill(process.env.E2E_ADMIN_EMAIL);
    await page.locator('#password').fill(process.env.E2E_ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Not asserting success — the staging DB has no migrations/seed data
    // yet (that's steps 3-4, still ahead). This only proves the auth
    // *request* is correctly routed to staging, never production.
    await page.waitForTimeout(2000);

    console.log(`Auth requests seen: ${authRequests.length}`);
    for (const url of authRequests) {
      const host = new URL(url).hostname;
      expect(host, `auth request went to ${host}, not the staging host`).toBe(STAGING_SUPABASE_HOST);
    }
    expect(authRequests.length, 'expected at least one auth request to have been made').toBeGreaterThan(0);
  });
});
