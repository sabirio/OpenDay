import { test, expect } from '@playwright/test';
import { getLocalFixturePassword } from '../../scripts/certification/fixturePassword.mjs';
import { login } from './helpers.js';

const LOCAL_FIXTURE_PASSWORD = getLocalFixturePassword();
const DASHBOARD_USERS = {
  admin: { email: 'admin-a@cert.local', password: LOCAL_FIXTURE_PASSWORD },
  pm: { email: 'pm-a-assigned@cert.local', password: LOCAL_FIXTURE_PASSWORD },
  viewer: { email: 'viewer-a@cert.local', password: LOCAL_FIXTURE_PASSWORD },
};

async function expectNoCorruptDashboardValues(page) {
  const text = await page.locator('.dashboard-page').innerText();
  expect(text).not.toMatch(/\bNaN\b|undefined%|null%/);
}

test.describe('Project Dashboard — Admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DASHBOARD_USERS.admin);
    await page.goto('/');
    await expect(page.locator('.dashboard-page')).toBeVisible({ timeout: 10_000 });
  });

  test('renders the compact Portfolio Overview panel with truthful reporting and unchanged master controls', async ({ page }, testInfo) => {
    await expect(page.locator('.dashboard-portfolio-overview')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Portfolio Overview');
    await expect(page.locator('.dashboard-page').getByText('Project Dashboard', { exact: true })).toHaveCount(0);
    const portfolioPanel = page.locator('.dashboard-portfolio-panel');
    await expect(portfolioPanel).toBeVisible();
    await expect(portfolioPanel).toContainText('Portfolio Health');
    await expect(portfolioPanel).toContainText('Portfolio Scope');
    await expect(portfolioPanel).toContainText('Reporting & Site Visits');
    await expect(portfolioPanel.getByText('Reports This Week')).toBeVisible();
    await expect(portfolioPanel.getByText('Site Visits', { exact: true })).toBeVisible();
    await expect(portfolioPanel.getByText(/\d+ of \d+ projects missing current reporting/)).toBeVisible();
    await expect(page.locator('.dashboard-portfolio-health, .dashboard-portfolio-scope')).toHaveCount(0);
    await expect(page.locator('.dashboard-portfolio-status-bar')).toBeVisible();
    await expect(page.locator('.dashboard-portfolio-donut')).toHaveCount(0);
    await expect(page.locator('.status-matrix-card')).toBeVisible();
    const panelBox = await portfolioPanel.boundingBox();
    const matrixBox = await page.locator('.status-matrix-card').boundingBox();
    expect(matrixBox.y - (panelBox.y + panelBox.height)).toBeLessThanOrEqual(13);
    expect(panelBox.height).toBeLessThan(220);
    await expect(page.getByRole('textbox', { name: 'Search projects' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Quick project filters' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Additional project filters/ })).toBeVisible();
    await expectNoCorruptDashboardValues(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard-portfolio-full.png') });

    await page.setViewportSize({ width: 422, height: 1800 });
    await page.getByRole('button', { name: /All Projects/ }).click();
    await expect(portfolioPanel).toBeVisible();
    const mobileColumnOrder = await portfolioPanel.locator('.dashboard-portfolio-column').evaluateAll((columns) => (
      [...columns].sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y).map((column) => column.querySelector('h2')?.textContent)
    ));
    expect(mobileColumnOrder).toEqual(['Portfolio Health', 'Reporting & Site Visits', 'Portfolio Scope']);
  });

  test('selected project exposes role-aware workflow handoffs and preserves five tabs and keyboard semantics', async ({ page }) => {
    const projectRows = page.locator('[data-testid="dashboard-master-project"]');
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });

    await projectRows.first().click();

    await expect(projectRows.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();
    await expect(page.locator('.dashboard-needs-attention')).toBeVisible();
    await expect(page.locator('.dashboard-status-strip')).toBeVisible();
    await expect(page.locator('.dashboard-health-metrics')).toHaveCount(0);
    const overviewSections = page.locator('.dashboard-project-overview > section');
    await expect(overviewSections).toHaveCount(6);
    await expect(overviewSections.nth(0)).toContainText('Needs Attention');
    await expect(overviewSections.nth(1)).toContainText('Continue project work');
    await expect(overviewSections.nth(2)).toContainText('Operational Status');
    await expect(overviewSections.nth(3)).toContainText('Schedule & Progress');
    await expect(overviewSections.nth(4)).toContainText('Recent Operational Evidence');
    await expect(overviewSections.nth(5)).toContainText('Project Context');

    const selectedProjectId = await projectRows.first().getAttribute('data-project-id');
    const workflow = page.getByRole('list', { name: 'Project workflow' });
    await expect(workflow.getByRole('link')).toHaveCount(4);
    await expect(workflow.getByRole('link', { name: /Reports/ })).toHaveAttribute('href', `/weekly-reports?project=${selectedProjectId}`);
    await expect(workflow.getByRole('link', { name: /Site Visit/ })).toHaveAttribute('href', `/site-visit/${selectedProjectId}`);
    await expect(workflow.getByRole('link', { name: /Risk/ })).toHaveAttribute('href', `/risk?project=${selectedProjectId}`);
    await expect(workflow.getByRole('link', { name: /Snags/ })).toHaveAttribute('href', `/projects/${selectedProjectId}/snags`);
    await expect(page.locator('.dashboard-project-workflows')).toContainText('Actions stay with source workflows');
    await expect(workflow).toContainText('Owned in source workflows');
    await expect(workflow.getByRole('link', { name: /Actions/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy report link' })).toHaveCount(0);

    const tabs = page.getByRole('tablist', { name: 'Dashboard detail views' }).getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(['Overview', 'Work Packages', 'Progress', 'Contractors', 'Activity']);

    const overview = page.getByRole('tab', { name: 'Overview' });
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Work Packages' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(overview).toHaveAttribute('aria-selected', 'true');

    for (const name of ['Work Packages', 'Progress', 'Contractors', 'Activity']) {
      const tab = page.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('tabindex', '0');
      await expect(page.locator('#dashboard-detail-tabpanel')).toBeVisible();
      await expect(page.locator('#dashboard-detail-tabpanel')).toHaveAttribute('aria-labelledby', await tab.getAttribute('id'));
      await expectNoCorruptDashboardValues(page);
    }
  });

  test('search and both filter controls preserve an open project; schedule action follows the existing predicate', async ({ page }) => {
    const projectRows = page.locator('[data-testid="dashboard-master-project"]');
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });
    const selectedId = await projectRows.first().getAttribute('data-project-id');
    const selectedText = await projectRows.first().innerText();
    const searchTerm = selectedText.split(/\r?\n/).find(Boolean);
    await projectRows.first().click();

    await page.getByRole('textbox', { name: 'Search projects' }).fill(searchTerm);
    await expect(page.locator(`[data-testid="dashboard-master-project"][data-project-id="${selectedId}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Active\b/ }).click();
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();
    await page.getByRole('combobox', { name: /Additional project filters/ }).selectOption('missing');
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();

    await page.getByRole('textbox', { name: 'Search projects' }).fill('');
    await page.getByRole('combobox', { name: /Additional project filters/ }).selectOption('all');

    await expect(page.getByRole('link', { name: 'Schedule Review' })).toHaveCount(0);

    await page.route('**/rest/v1/projects*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const projected = Array.isArray(body)
        ? body.map((project) => String(project.id) === selectedId
            ? { ...project, schedule_ownership_mode: 'CONTRACTOR_MANAGED' }
            : project)
        : body;
      await route.fulfill({ response, json: projected });
    });
    await page.reload();
    await page.locator(`[data-testid="dashboard-master-project"][data-project-id="${selectedId}"]`).click();
    await expect(page.getByRole('link', { name: 'Schedule Review' })).toBeVisible();
    await page.unrouteAll({ behavior: 'wait' });
  });

  test('Reports and Risk handoffs preserve the selected project context', async ({ page }) => {
    const projectRows = page.locator('[data-testid="dashboard-master-project"]');
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });
    await projectRows.first().click();

    const selectedProjectId = await projectRows.first().getAttribute('data-project-id');
    const selectedProjectName = await projectRows.first().locator('.master-row-name').innerText();

    await page.getByRole('list', { name: 'Project workflow' }).getByRole('link', { name: /Reports/ }).click();
    await expect(page).toHaveURL(new RegExp(`/weekly-reports\\?project=${selectedProjectId}$`));
    await expect(page.locator('.weekly-detail-header')).toContainText(selectedProjectName);

    await page.goto(`/?project=${selectedProjectId}`);
    await expect(page.locator('.dashboard-project-overview')).toBeVisible();
    await page.getByRole('list', { name: 'Project workflow' }).getByRole('link', { name: /Risk/ }).click();
    await expect(page).toHaveURL(new RegExp(`/risk\\?project=${selectedProjectId}$`));
    await expect(page.locator('.risk-detail-header')).toContainText(selectedProjectName);
  });

  test('responsive Master to Detail to Back preserves state and captures the Dashboard region', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const projectRows = page.locator('[data-testid="dashboard-master-project"]');
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });
    await projectRows.first().click();
    const desktopWorkspaceBox = await page.locator('.dashboard-master-detail').boundingBox();
    const desktopSidebarBox = await page.locator('.sidebar').boundingBox();
    const desktopMasterPaneBox = await page.locator('.master-pane').boundingBox();
    const desktopDetailPaneBox = await page.locator('.detail-pane').boundingBox();
    const desktopMasterHeaderBox = await page.locator('.dashboard-master-header').boundingBox();
    const desktopDetailHeaderBox = await page.locator('.dashboard-detail-header').boundingBox();
    const desktopDetailTabsBox = await page.locator('.dashboard-detail-tabs').boundingBox();
    await expect(page.locator('.dashboard-page-header')).toHaveCount(0);
    expect(desktopWorkspaceBox.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(desktopSidebarBox.width - 224)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(desktopMasterPaneBox.x - (desktopSidebarBox.x + desktopSidebarBox.width))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(desktopMasterPaneBox.width - 336)).toBeLessThanOrEqual(1);
    expect(Math.abs(desktopDetailPaneBox.x - (desktopMasterPaneBox.x + desktopMasterPaneBox.width) - 8)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(desktopMasterHeaderBox.height - 132)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(desktopDetailHeaderBox.height - 96)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(desktopDetailTabsBox.height - 36)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(
      (desktopMasterHeaderBox.y + desktopMasterHeaderBox.height)
      - (desktopDetailTabsBox.y + desktopDetailTabsBox.height),
    )).toBeLessThanOrEqual(0.5);
    const desktopSectionTops = await page.locator('.dashboard-project-overview > section').evaluateAll(
      sections => sections.map(section => section.getBoundingClientRect().top),
    );
    expect(desktopSectionTops).toEqual([...desktopSectionTops].sort((a, b) => a - b));
    await page.screenshot({ path: testInfo.outputPath('dashboard-desktop-full.png') });
    await page.locator('.dashboard-page').screenshot({ path: testInfo.outputPath('dashboard-desktop.png') });

    await page.setViewportSize({ width: 900, height: 900 });
    await page.locator('.dashboard-back-to-master').click();
    await expect(page.locator('.master-pane')).toBeVisible();
    await expect(page.locator('.detail-pane')).toBeHidden();
    await page.getByRole('textbox', { name: 'Search projects' }).fill('TEST');
    await expect(page.getByRole('textbox', { name: 'Search projects' })).toHaveValue('TEST');
    await page.getByRole('textbox', { name: 'Search projects' }).fill('');
    await page.locator('[data-testid="dashboard-master-project"]').first().click();
    await expect(page.locator('.master-pane')).toBeHidden();
    await expect(page.locator('.detail-pane')).toBeVisible();
    await page.getByRole('tab', { name: 'Progress' }).click();
    await page.locator('.dashboard-back-to-master').click();
    await expect(page.locator('.master-pane')).toBeVisible();
    await page.locator('[data-testid="dashboard-master-project"]').first().click();
    await expect(page.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');

    await page.setViewportSize({ width: 640, height: 1000 });
    await expect(page.locator('.master-pane')).toBeHidden();
    await expect(page.locator('.detail-pane')).toBeVisible();
    await page.locator('.dashboard-back-to-master').click();
    await expect(page.locator('.master-pane')).toBeVisible();
    await page.locator('[data-testid="dashboard-master-project"]').first().click();
    await expect(page.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.dashboard-detail-tabs')).toHaveCSS('overflow-x', 'auto');

    await page.setViewportSize({ width: 422, height: 1800 });
    await page.locator('.dashboard-back-to-master').click();
    await expect(page.locator('.dashboard-page-header')).toHaveCount(0);
    await page.locator('.dashboard-page').screenshot({ path: testInfo.outputPath('dashboard-mobile-master.png') });
    await page.locator('[data-testid="dashboard-master-project"]').first().click();
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.locator('.dashboard-page-header')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to Projects' })).toBeVisible();
    await expect(page.locator('.dashboard-tabs-overflow-cue')).toBeVisible();
    const workflowRowHeights = await page.locator('.dashboard-workflow-handoffs > li').evaluateAll(
      rows => rows.map(row => row.getBoundingClientRect().height),
    );
    expect(workflowRowHeights).toHaveLength(5);
    expect(workflowRowHeights.every(height => height >= 44)).toBe(true);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBe(0);
    await page.locator('.dashboard-page').screenshot({ path: testInfo.outputPath('dashboard-mobile-detail.png') });
    await expect(page.locator('.dashboard-detail-tabs')).toHaveCSS('overflow-x', 'auto');
    await expectNoCorruptDashboardValues(page);
  });
});

test.describe('Project Dashboard — PM', () => {
  test('PM sees Project Dashboard with no Users nav item', async ({ page }) => {
    await login(page, DASHBOARD_USERS.pm);
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Portfolio Overview', { timeout: 10_000 });
    await expect(page.locator('aside nav').getByRole('link', { name: 'Users', exact: true })).not.toBeVisible();
  });
});

test.describe('Project Dashboard Viewer workflow boundary', () => {
  test('workflow handoffs follow the existing Viewer permission boundary', async ({ page }) => {
    await login(page, DASHBOARD_USERS.viewer);
    await page.goto('/');
    const projectRows = page.locator('[data-testid="dashboard-master-project"]');
    await expect(projectRows.first()).toBeVisible({ timeout: 15_000 });
    await projectRows.first().click();

    const workflow = page.getByRole('list', { name: 'Project workflow' });
    await expect(workflow.getByRole('link')).toHaveCount(1);
    await expect(workflow.getByRole('link', { name: /Snags/ })).toBeVisible();
    await expect(workflow.getByRole('link', { name: /Reports|Site Visit|Risk/ })).toHaveCount(0);
    await expect(workflow).toContainText('Actions');
  });
});
