import { readFileSync } from 'node:fs';
import { resolvePreferredStakeholder, selectSnagNavigation } from '../core/presentation/snagPresentationModel.js';

let pass = 0, fail = 0;
const check = (n, v) => { if (v) { pass++; console.log(`  OK ${n}`); } else { fail++; console.error(`  FAIL ${n}`); } };
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

// ── selectSnagNavigation (Previous/Next for mobile Observation review) ──
const order = ['a', 'b', 'c'];
check('navigation finds middle item with both neighbours', JSON.stringify(selectSnagNavigation(order, 'b')) === JSON.stringify({ index: 1, previousId: 'a', nextId: 'c', position: 2, total: 3 }));
check('navigation hides previous at the start of the list', selectSnagNavigation(order, 'a').previousId === null);
check('navigation hides next at the end of the list', selectSnagNavigation(order, 'c').nextId === null);
check('navigation is inert for a deep link with no known order', JSON.stringify(selectSnagNavigation(undefined, 'x')) === JSON.stringify({ index: -1, previousId: null, nextId: null, position: null, total: 0 }));
check('navigation matches ids across string/number identity', selectSnagNavigation([1, 2, 3], '2').nextId === 3);

// ── resolvePreferredStakeholder (trade -> preselected responsible party) ──
const mappings = [
  { trade_id: 't1', stakeholder_id: 's1', is_preferred: false },
  { trade_id: 't1', stakeholder_id: 's2', is_preferred: true },
  { trade_id: 't2', stakeholder_id: 's3', is_preferred: false },
];
check('preferred stakeholder is resolved for a mapped trade', resolvePreferredStakeholder(mappings, 't1') === 's2');
check('no preferred stakeholder yields null, not a guess', resolvePreferredStakeholder(mappings, 't2') === null);
check('unmapped trade yields null', resolvePreferredStakeholder(mappings, 'unknown') === null);
check('missing trade id yields null without throwing', resolvePreferredStakeholder(mappings, null) === null);
check('missing mappings array does not throw', resolvePreferredStakeholder(undefined, 't1') === null);

// ── Shared-core architecture: mobile Field Mode must reuse, not fork ────
const planController = read('../hooks/plans/usePlanController.js');
const planViewer = read('../pages/plans/PlanViewerPage.jsx');
const fieldPlanView = read('../components/snags/mobile/SnagFieldPlanView.jsx');
check('a single usePlanPlacement hook owns the pin-placement state machine', planController.includes('export function usePlanPlacement'));
check('desktop PlanViewerPage uses the shared placement hook', planViewer.includes('usePlanPlacement('));
check('mobile Plan view uses the shared placement hook', fieldPlanView.includes('usePlanPlacement('));
check('mobile Plan view does not redefine its own long-press timer', !fieldPlanView.includes('pressTimer'));
check('mobile Plan view reuses the canonical normalized coordinate engine via the shared hook, not its own math', !fieldPlanView.includes('clientX-rect.left') && !fieldPlanView.includes('normalizePlanPoint('));

const fieldShell = read('../components/snags/mobile/SnagFieldShell.jsx');
const fieldListView = read('../components/snags/mobile/SnagFieldListView.jsx');
const fieldCard = read('../components/snags/mobile/SnagFieldCard.jsx');
const fieldFilterSheet = read('../components/snags/mobile/SnagFieldFilterSheet.jsx');
const fieldTabBar = read('../components/snags/mobile/SnagFieldTabBar.jsx');
const mobileSource = [fieldShell, fieldPlanView, fieldListView, fieldCard, fieldFilterSheet, fieldTabBar].join('\n');

check('mobile components use only the shared snag/plan hooks, never core/services/engines internals', !mobileSource.match(/core\/snags|core\/plans|services\/snags|services\/plans|engines\//));
check('mobile filter sheet reuses the desktop SnagFilters form instead of a second filter UI', fieldFilterSheet.includes("from '../SnagFilters.jsx'") || fieldFilterSheet.includes('from "../SnagFilters.jsx"'));
check('mobile capture setup reuses the shared CaptureSetup component', fieldShell.includes('CaptureSetup'));

// ── PLAN | LIST | ADD navigation surface ─────────────────────────────
check('tab bar exposes Plan, List and Add', /Plan/.test(fieldTabBar) && /List/.test(fieldTabBar) && /Add/.test(fieldTabBar));
check('Add is only offered to roles that can create observations', fieldTabBar.includes('canCreate'));

// ── Captured must remain Captured (no implicit publish on save) ────────
check('mobile plan capture opens the capture-completion screen, not an auto-publish call', fieldPlanView.includes("capture=1") && !fieldPlanView.includes('publishObservation'));
check('mobile list view treats publish as an explicit, separate batch action', fieldListView.includes("type: 'batchPublish'"));

// ── Security: mobile plan view still gates placement by role ───────────
check("mobile plan placement is still gated to ['Admin','PM']", fieldPlanView.includes("['Admin', 'PM']") || fieldPlanView.includes("['Admin','PM']"));

// ── Desktop regression: original desktop markup/hooks are untouched ────
const snagListPage = read('../pages/snags/SnagListPage.jsx');
const snagFieldPage = read('../pages/snags/SnagFieldPage.jsx');
const app = read('../App.jsx');
check('Site Snag management shell remains the normal project route', snagListPage.includes('site-snag-page') && snagListPage.includes('Site Snag'));
check('Field Snag List has a canonical standalone route (see fieldSnagStandalone.test.mjs for full routing contract)', app.includes('/field-snag/:projectId') && snagFieldPage.includes('<SnagFieldShell'));
check('viewport no longer switches Site Snag into Field Snag List', !snagListPage.includes('useIsMobile') && !snagListPage.includes('<SnagFieldShell'));

// ── Trade -> preferred stakeholder preselection wired into the shared detail page ──
const snagDetailPage = read('../pages/snags/SnagDetailPage.jsx');
check('SnagDetailPage capture form preselects the preferred stakeholder on trade change', snagDetailPage.includes('resolvePreferredStakeholder(catalog.mappings'));
check('preselection is still an editable field, not a locked value', /stakeholderId:\s*event\.target\.value/.test(snagDetailPage));

// ── Previous/Next review navigation lives on the shared detail page ────
check('SnagDetailPage computes Previous/Next from the shared navigation selector', snagDetailPage.includes('selectSnagNavigation(navOrder'));
check('Previous/Next only renders once a navigation order is known (no phantom nav on deep links)', snagDetailPage.includes('nav.total > 1'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
