import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const app = read('../App.jsx');
const permissions = read('../auth/rolePermissions.js');
const sidebar = read('../components/Sidebar.jsx');
const fieldSnagSelect = read('../pages/snags/FieldSnagSelect.jsx');
const legacyRedirect = read('../pages/snags/LegacyFieldSnagRedirect.jsx');
const projectSelectList = read('../components/shared/ProjectSelectList.jsx');
const siteVisitSelect = read('../pages/SiteVisitSelect.jsx');
const snagFieldPage = read('../pages/snags/SnagFieldPage.jsx');
const snagFieldShell = read('../components/snags/mobile/SnagFieldShell.jsx');
const snagFieldPlanView = read('../components/snags/mobile/SnagFieldPlanView.jsx');
const snagFieldListView = read('../components/snags/mobile/SnagFieldListView.jsx');
const snagListPage = read('../pages/snags/SnagListPage.jsx');
const snagDetailPage = read('../pages/snags/SnagDetailPage.jsx');
const fieldModeCss = read('../styles/snagFieldMode.css');

// ── 1. Sidebar: Site Snag standalone, Site Works = Site Visit + Field Snag List ──
const siteWorksBlock = (permissions.match(/id: 'site-works'[\s\S]*?\]/) || [''])[0];
check('Site Snag is a standalone top-level NAV_ITEMS entry', /\{ to: '\/snags',\s*label: 'Site Snag'/.test(permissions));
check('Site Works group exists and is expandable via Sidebar.jsx', permissions.includes("id: 'site-works'") && sidebar.includes('aria-expanded={expanded}'));
check('Site Works children are exactly Site Visit and Field Snag List', siteWorksBlock.includes("label: 'Site Visit'") && siteWorksBlock.includes("label: 'Field Snag List'") && !siteWorksBlock.includes('Site Snag'));
check('Field Snag List sidebar entry points at the selector, not a specific project', siteWorksBlock.includes("to: '/field-snag'") && !/to: '\/field-snag\/\$\{/.test(siteWorksBlock));

// ── 2. Field Snag project-selection page ─────────────────────────────
check('Field Snag selection page has the expected title and helper copy', fieldSnagSelect.includes('Field Snag List') && fieldSnagSelect.includes('Select a project to capture and review site observations.'));
check('Field Snag selection reuses the shared project-select list instead of a bespoke one', fieldSnagSelect.includes('ProjectSelectList'));
check('Field Snag selection navigates into the canonical per-project route', fieldSnagSelect.includes("`/field-snag/${project.id}`"));
check('Field Snag selection has an accessible empty state', fieldSnagSelect.includes('empty-state') && fieldSnagSelect.includes('role="status"'));
check('Field Snag selection receives the same access-scoped projects prop as other project surfaces (no new frontend access rule)', /FieldSnagSelect\(\{\s*projects\s*=\s*\[\]\s*\}\)/.test(fieldSnagSelect));

// ── 3. Shared selection component: Site Visit unaffected ────────────
check('Site Visit selection now reuses the extracted shared component', siteVisitSelect.includes('ProjectSelectList') && siteVisitSelect.includes("`/site-visit/${project.id}`"));
check('Site Visit selection title/copy are unchanged', siteVisitSelect.includes('Site Visit') && siteVisitSelect.includes('Select a project to record PM site observations.'));
check('shared component exposes a semantic, keyboard-accessible row control', projectSelectList.includes('<button') && projectSelectList.includes('aria-label={`${ariaLabelPrefix}'));

// ── 4. Routing: canonical route, legacy redirect, query preservation ─
check('canonical Field Snag workspace route is a top-level route (outside <Layout>, matches /site-visit/:projectId pattern)', app.includes('path="/field-snag/:projectId"'));
check('canonical route renders the existing SnagFieldPage/SnagFieldShell — no second implementation', /path="\/field-snag\/:projectId"[\s\S]{0,200}SnagFieldPage/.test(app));
check('Field Snag selector route is registered inside the app shell like /site-visit-select', app.includes('path="/field-snag"') && app.includes('FieldSnagSelect'));
check('legacy route is a redirect-only compatibility shim, not a second workspace', app.includes('path="/projects/:projectId/snags/field"') && app.includes('LegacyFieldSnagRedirect') && !/path="\/projects\/:projectId\/snags\/field"[\s\S]{0,120}SnagFieldPage/.test(app));
check('legacy redirect preserves the existing query string (e.g. ?tab=list)', legacyRedirect.includes('useSearchParams') && legacyRedirect.includes('query.toString()') && legacyRedirect.includes('replace'));
check('legacy redirect targets the canonical per-project route', legacyRedirect.includes('/field-snag/${projectId}'));

// ── 5. Site Snag shortcut opens the canonical route directly ────────
check('Site Snag "Open Field Snag List" shortcut links directly to the canonical per-project route', snagListPage.includes('`/field-snag/${projectId}`'));
check('the shortcut no longer routes through project selection', !snagListPage.includes("to={`/projects/${projectId}/snags/field}`") && !snagListPage.includes('/projects/${projectId}/snags/field'));

// ── 6. Field Snag workspace: canonical, shared Observation core ─────
check('SnagFieldPage is the single canonical Field Snag workspace entry (no parallel implementation)', snagFieldPage.includes('useSnagWorkspace') && snagFieldPage.includes('<SnagFieldShell'));
check('Field Snag internal navigation (back link, plan/list returnTo) targets the canonical route', snagFieldShell.includes("to=\"/field-snag\"") && snagFieldPlanView.includes('/field-snag/${projectId}') && snagFieldListView.includes('/field-snag/${projectId}'));
check('Field Snag workspace still exposes Plan | List | Add', snagFieldShell.includes('SnagFieldTabBar'));

// ── 7. White, Site-Visit-like field shell (theme-independent) ───────
check('Field Snag shell uses the fixed --field-* palette, not the app theme tokens directly', fieldModeCss.includes('--field-bg-snag') && fieldModeCss.includes('--field-text-heading') && fieldModeCss.includes("--bg-base: var(--field-bg-snag)"));
check('Field Snag header presents project identity in a card, like Site Visit’s header card', fieldModeCss.includes('snag-field-header-card') && snagFieldShell.includes('snag-field-header-card') && snagFieldShell.includes('snag-field-eyebrow'));
check('Field Snag shell no longer reserves space for a sidebar (top-level route has none)', !fieldModeCss.includes("left: 200px") && !fieldModeCss.includes('left: 216px'));

// ── 8. Observation Back / Previous-Next context is not regressed ────
check('SnagDetailPage still derives the back label from where returnTo actually points (Site Snag vs Field Snag)', snagDetailPage.includes("isFieldReturn") && snagDetailPage.includes("contextualReturn?.includes('/field-snag/')"));
check('Previous/Next still carries returnTo across pages (no context loss when paging)', /goToObservation = id => navigate\(`\/projects\/\$\{projectId\}\/snags\/\$\{id\}`, \{[\s\S]*?returnTo/.test(snagDetailPage));
check('created-param helper remains bare-path safe for the canonical Field Snag route', snagDetailPage.includes('withCreatedParam') && snagDetailPage.includes("url.includes('?')"));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
