import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { CREDENTIALS, login, logout } from './helpers.js';
import {
  TENDER_COMMERCIAL_E2E as fixture,
  cleanupTenderCommercialE2EFixture,
  readTenderCommercialE2EState,
  setTenderCommercialE2EBoqMode,
  setupTenderCommercialE2EFixture,
} from '../../scripts/certification/tenderCommercialE2EFixture.mjs';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const makeClient = () => createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function signInAsContractor() {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({
    email: CREDENTIALS.contractor.email,
    password: CREDENTIALS.contractor.password,
  });
  if (error) throw error;
  return client;
}

async function openFixtureCard(page) {
  const card = page.locator('article.bidder-tender-card').filter({ hasText: fixture.title });
  await expect(card).toBeVisible();
  return card;
}

async function openFirstWorkGroup(page) {
  const group = page.locator('details.boq-work-group').first();
  await expect(group).toBeVisible();
  if (!(await group.getAttribute('open'))) await group.locator('summary').click();
  await expect(group.locator('tbody tr').first()).toBeVisible();
  return group;
}

test.beforeAll(() => {
  const state = setupTenderCommercialE2EFixture();
  expect(state.tenderCount).toBe(1);
  expect(state.boqMode).toBe('CONTRACTOR_MEASURED');
});

test.afterAll(() => {
  cleanupTenderCommercialE2EFixture();
});

test('commercial spine: PM overview -> invitation -> both BOQ modes -> immutable bid', async ({ page }) => {
  await test.step('PM sees the state-driven Tender workspace', async () => {
    await login(page, CREDENTIALS.admin);
    await page.goto(`/projects/${fixture.projectId}/tender`);
    await expect(page.getByRole('heading', { name: 'Tender setup' })).toBeVisible();
    for (const tab of ['Overview', 'Participants', 'BOQ', 'Bids', 'Comparison', 'Clarifications', 'Award']) {
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Consultant', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Title')).toHaveValue(fixture.title);

    await page.goto(`/projects/${fixture.projectId}/project-team`);
    await expect(page.getByRole('heading', { name: 'Project Team', exact: true, level: 1 })).toBeVisible();
    await page.locator('.project-team-table tbody tr').first().getByRole('button', { name: 'Edit' }).click();
    const department = page.getByLabel('Project department');
    await expect(department).toContainText('Security');
    await department.selectOption('SECURITY');
    await expect(page.getByRole('button', { name: 'Save department' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await logout(page);
  });

  const contractorDb = await signInAsContractor();

  await test.step('Invited is not Accepted and the package is denied before acceptance', async () => {
    const { error: activationError } = await contractorDb.rpc('activate_my_tender_invitations');
    expect(activationError).toBeNull();
    const { error: deniedError } = await contractorDb.rpc('get_my_tender_workspace', { p_tender_id: fixture.tenderId });
    expect(deniedError).not.toBeNull();

    await login(page, CREDENTIALS.contractor);
    await page.goto('/tenders');
    const card = await openFixtureCard(page);
    await expect(card.getByText('INVITED', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Open Tender Package' })).toHaveCount(0);
    await card.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(card.getByText('ACCEPTED', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Open Tender Package' })).toBeVisible();
  });

  await test.step('RLS exposes only the contractor own participation', async () => {
    const { data, error } = await contractorDb
      .from('project_tender_bidder_access')
      .select('participant_id, contractor_name, invited_email')
      .eq('tender_id', fixture.tenderId);
    expect(error).toBeNull();
    expect(data).toEqual([{
      participant_id: fixture.primaryParticipantId,
      contractor_name: fixture.primaryContractor,
      invited_email: fixture.primaryEmail,
    }]);
    await expect(page.getByText(fixture.competitorContractor)).toHaveCount(0);
    await expect(page.getByText(fixture.competitorEmail)).toHaveCount(0);
  });

  await test.step('Contractor Measured hides Consultant Qty and saves contractor pricing', async () => {
    const card = await openFixtureCard(page);
    await card.getByRole('button', { name: 'Open Tender Package' }).click();
    await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
    await expect(page.getByText('Budget', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Committed', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Forecast', { exact: true })).toHaveCount(0);

    const group = await openFirstWorkGroup(page);
    await expect(group.getByRole('columnheader', { name: 'Qty by Contractor' })).toBeVisible();
    await expect(group.getByRole('columnheader', { name: 'Qty by Consultant' })).toHaveCount(0);

    const row = group.locator('tbody tr').first();
    const contractorQuantity = row.getByLabel(/Contractor Quantity/);
    const labour = row.getByLabel(/Labour for/);
    const material = row.getByLabel(/Material for/);
    await expect(contractorQuantity).toBeEnabled();
    await contractorQuantity.fill('2');
    await labour.fill('100');
    await material.fill('50');
    await expect(row.locator('td').nth(6)).toHaveText('300.00');

    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft revision 1 saved.')).toBeVisible();
    const state = readTenderCommercialE2EState();
    expect(state.draftRevision).toBe(1);
  });

  await test.step('Consultant Measured shows read-only consultant quantity and contractor variance', async () => {
    setTenderCommercialE2EBoqMode('CONSULTANT_MEASURED');
    await page.reload();
    const card = await openFixtureCard(page);
    await card.getByRole('button', { name: 'Open Tender Package' }).click();
    const group = await openFirstWorkGroup(page);
    await expect(group.getByRole('columnheader', { name: 'Qty by Consultant' })).toBeVisible();
    await expect(group.getByRole('columnheader', { name: 'Variance' })).toBeVisible();

    const row = group.locator('tbody tr').first();
    await expect(row.getByLabel(/Consultant Quantity/)).toBeDisabled();
    await expect(row.getByLabel(/Consultant Quantity/)).toHaveValue('10');
    await expect(row.getByLabel(/Contractor Quantity/)).toBeEnabled();
    await expect(row.getByLabel(/Contractor Quantity/)).toHaveValue('2');
    await expect(row.locator('td').nth(5)).toHaveText(/[−-]80\.00%/);
    await expect(row.locator('td').nth(8)).toHaveText('300.00');
  });

  await test.step('Submission becomes immutable and audit/financial values are preserved', async () => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Submit bid' }).click();
    await expect(page.getByText('Bid submitted.')).toBeVisible();
    await expect(page.getByLabel(/Contractor Quantity/).first()).toBeDisabled();

    const state = readTenderCommercialE2EState();
    expect(state.invitationStatus).toBe('ACCEPTED');
    expect(state.invitationEvents).toContain('INVITED');
    expect(state.invitationEvents).toContain('OPENED');
    expect(state.invitationEvents).toContain('ACCEPTED');
    expect(state.submissionCount).toBe(1);
    expect(Number(state.submittedTotal)).toBe(300);
  });
});
