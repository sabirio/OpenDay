import { readFileSync } from 'node:fs';
import { buildSiteSnagOverview } from '../engines/snagReadModelEngine.js';

let pass = 0, fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const snags = [
  { id: '1', title: 'Door', status: 'OPEN', dueDate: '2026-07-01', publicationState: 'CAPTURED', tradeId: 't1', stakeholderId: 's1' },
  { id: '2', title: 'Tile', status: 'ASSIGNED', dueDate: '2026-08-01', publicationState: 'PUBLISHED', tradeId: 't1', stakeholderId: 's2' },
  { id: '3', title: 'Light', status: 'IN_PROGRESS', dueDate: '2026-07-10', publicationState: 'PUBLISHED', tradeId: 't2', stakeholderId: 's1' },
  { id: '4', title: 'Sign', status: 'READY_FOR_REVIEW', dueDate: null, publicationState: 'CAPTURED', tradeId: null, stakeholderId: null },
  { id: '5', title: 'Closed', status: 'CLOSED', dueDate: '2026-06-01', publicationState: 'PUBLISHED', tradeId: 't2', stakeholderId: 's1' },
  { id: '6', title: 'Cancelled', status: 'CANCELLED', dueDate: '2026-06-01', publicationState: 'CAPTURED', tradeId: null, stakeholderId: null },
];
const catalog = {
  trades: [{ id: 't1', name: 'Electrical' }, { id: 't2', name: 'Finishes' }],
  stakeholders: [{ id: 's1', company_name: 'Main Contractor' }, { id: 's2', company_name: 'Installer' }],
};
const overview = buildSiteSnagOverview(snags, catalog, new Date('2026-07-21T12:00:00Z'));
check('Overview counts all non-terminal Observations as open', overview.open === 4);
check('Overview overdue excludes closed and cancelled Observations', overview.overdue === 2);
check('Overview counts Captured publication state', overview.captured === 3);
check('Overview counts Published publication state', overview.published === 3);
check('Overview groups by authoritative Trade catalog labels', overview.byTrade.map(({ label, count }) => ({ label, count })).every((item, index) => JSON.stringify(item) === JSON.stringify([{ label: 'Electrical', count: 2 }, { label: 'Finishes', count: 2 }, { label: 'Trade not assigned', count: 2 }][index])));
check('Overview groups by responsible Stakeholder catalog labels', overview.byStakeholder[0].label === 'Main Contractor' && overview.byStakeholder[0].count === 3);

const sidebar = read('../components/Sidebar.jsx');
const permissions = read('../auth/rolePermissions.js');
const app = read('../App.jsx');
const sitePage = read('../pages/snags/SnagListPage.jsx');
const fieldPage = read('../pages/snags/SnagFieldPage.jsx');
const fieldShell = read('../components/snags/mobile/SnagFieldShell.jsx');
const sitePlan = read('../components/snags/site/SiteSnagPlanView.jsx');
const preview = read('../components/snags/site/SiteSnagPinPreview.jsx');

check('Sidebar defines expandable Site Works with Site Visit and Site Snag children', permissions.includes("label: 'Site Works'") && permissions.includes("label: 'Site Visit'") && permissions.includes("label: 'Site Snag'") && sidebar.includes('aria-expanded={expanded}'));
check('active Site Works child opens and marks its group active', sidebar.includes('toggleState.pathname === pathname ? toggleState.expanded : childActive') && sidebar.includes("sidebar-nav-group${childActive ? ' active' : ''}"));
check('Field Snag List is not a permanent sidebar child', !permissions.includes("label: 'Field Snag List'"));
check('explicit project-scoped Field Snag route is registered before snagId detail', app.indexOf('/projects/:projectId/snags/field') > -1 && app.indexOf('/projects/:projectId/snags/field') < app.indexOf('/projects/:projectId/snags/:snagId'));
check('Site Snag exposes Overview, Plan and Observations', ['Overview', 'Plan', 'Observations'].every((label) => sitePage.includes(`label: '${label}'`)));
check('Site Snag promotes only Open Field Snag List for capture', sitePage.includes('Open Field Snag List') && !sitePage.includes('Add Observation') && !sitePage.includes('CaptureSetup'));
check('viewport no longer selects Site Snag vs Field Snag List', !sitePage.includes('useIsMobile') && !sitePage.includes('SnagFieldShell') && fieldPage.includes('<SnagFieldShell'));
check('Field Snag List uses route query for Plan/List mode', fieldShell.includes("query.get('tab')") && fieldShell.includes('setQuery('));
check('Site Snag Plan is read-only and reuses plan hooks', sitePlan.includes('usePlanPins') && sitePlan.includes('usePlanDocument') && !sitePlan.includes('usePlanPlacement') && !sitePlan.includes('useCaptureCommand'));
check('pin selection opens quick preview with private evidence and full detail access', sitePlan.includes('SiteSnagPinPreview') && preview.includes('EvidenceItem') && preview.includes('View Observation'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
