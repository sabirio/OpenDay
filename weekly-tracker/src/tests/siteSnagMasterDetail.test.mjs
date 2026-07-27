// siteSnagMasterDetail.test.mjs — Site Snag P0 (Observation control center).
// Structural/wiring checks for the master-detail rework, following the same
// plain source-text-assertion convention as siteSnagWorkspace.test.mjs (no
// DOM/RTL harness is set up in this repo). Pure canonical-logic behavior
// (deriveDueState, getAvailableSnagActions, etc.) is exhaustively covered
// elsewhere (snagWorkflow.test.mjs, portfolioEngineAlerts-style engine
// suites) and is not re-tested here — this file only proves the UI wiring
// reuses that logic rather than duplicating it, and that the new
// master-detail structure is actually in place.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const app          = read('../App.jsx');
const selectPage    = read('../pages/snags/SnagProjectSelectPage.jsx');
const listPage      = read('../pages/snags/SnagListPage.jsx');
const detailPage    = read('../pages/snags/SnagDetailPage.jsx');
const observations  = read('../components/snags/site/SiteSnagObservations.jsx');
const presentation  = read('../core/presentation/snagPresentationModel.js');

// ── 1. Project selection reuses the shared component, correct target route ──
check('Site Snag project selection reuses the shared ProjectSelectList component', selectPage.includes('ProjectSelectList'));
check('project selection opens the correct project\'s Site Snag workspace', selectPage.includes('`/projects/${project.id}/snags`'));

// ── 2. Observations mode uses the shared MasterDetailLayout ─────────────
check('Site Snag Observations mode renders through the shared MasterDetailLayout', listPage.includes('<MasterDetailLayout') && listPage.includes("from '../../components/shared/MasterDetailLayout.jsx'"));

// ── 3/4. Deep link is the selection contract, no second query-param mechanism ──
check('the existing per-observation route drives selection (no new route registered)', /path="\/projects\/:projectId\/snags\/:snagId"/.test(app));
check('the deep-link route renders the same SnagListPage workspace (not a standalone detail page)', /path="\/projects\/:projectId\/snags\/:snagId"[\s\S]{0,120}SnagListPage/.test(app));
check('SnagListPage reads the optional snagId param to drive the detail pane (URL is the selection state)', /const \{ projectId, snagId \} = useParams\(\)/.test(listPage));
check('the existing SnagDetailPage content is reused as the detail pane, not reimplemented', listPage.includes('<SnagDetailPage') && listPage.includes("from './SnagDetailPage.jsx'"));

// ── 5. Filter/selection state is not tied to the observation route ──────
check('filters/selected/quick-view state lives in useSnagWorkspace inside SnagListPage, which stays mounted across observation selection', listPage.includes('useSnagWorkspace(projectId)') && !listPage.includes('useState') );

// ── 6/7. Quick views: declarative model, counts, and merge-not-replace fix ──
check('the previously-hardcoded "Captured" quick view is folded into the declarative SNAG_QUICK_VIEWS list', presentation.includes("{label:'Captured',filters:{publicationState:'CAPTURED'}}") && !observations.includes("setFilters({ publicationState: 'CAPTURED' })"));
check('quick-view counts are computed from canonical filterSnags, not a new filtering engine', presentation.includes('export function countSnagQuickViews') && presentation.includes('filterSnags(snags,mapped,asOf)'));
check('selecting a quick view preserves other manually-entered filters (merge, not full replace)', observations.includes('QUICK_VIEW_OWNED_KEYS') && /setFilters\(\(current\) => \{/.test(observations) && observations.includes('!QUICK_VIEW_OWNED_KEYS.includes(key)'));

// ── 8. Single-observation publish reuses batchPublish, no second command ──
check('SnagDetailPage exposes a single-observation Publish action', detailPage.includes('saveAndPublish') && detailPage.includes("'Publishing...' : 'Publish'"));
check('single-observation publish reuses the exact batchPublish command with a one-item collection (no new publish command)', /publish\.execute\(\{ type: 'batchPublish', projectId, snagIds: \[snag\.id\] \}\)/.test(detailPage));
check('single-observation publish does not skip the existing partial-publish notice', detailPage.includes('formatPublishNoticeMessage(result)'));

// ── 9. Bulk publish is untouched (already exercised in snagFieldCaptureUi.test.mjs) ──
check('bulk publish still routes through batchPublish with the full selection', observations.includes("type: 'batchPublish'") && observations.includes('Publish selected'));

// ── 10. Canonical action/state derivation is not duplicated anywhere touched ──
check('the detail pane still derives its action set only from buildSnagListModel -> getAvailableSnagActions', detailPage.includes('buildSnagListModel([snag], {}, actor)') && !detailPage.includes('TRANSITIONS'));

// ── 11. Plan mode is untouched structurally ──────────────────────────────
check('Plan mode is preserved as a sibling top-level mode, not merged into the master-detail layout', /mode === 'plan' \? \(\s*<SiteSnagPlanView/.test(listPage));

// ── 12. "View on plan" is a lightweight contextual link, not an embedded canvas ──
check('the detail pane exposes a contextual "View on plan" link when the observation has a plan pin', detailPage.includes('View on plan') && detailPage.includes('drawingReturn'));
check('"View on plan" does not embed the plan canvas inside the detail pane (no canvas/plan-controls markup added here)', !detailPage.includes('<canvas') && !detailPage.includes('plan-controls'));

// ── 13. Mobile master/detail derives from the URL, not separate state ───
check('mobileView is derived from snagId presence (cannot desync from the URL-driven selection)', /const mobileView = snagId \? 'detail' : 'master'/.test(listPage));

// ── 14. No Field Snag components/hooks were pulled into Site Snag ───────
check('Site Snag master list does not import any Field Snag mobile component', !observations.includes('mobile/SnagField') && !listPage.includes('mobile/SnagField'));
check('SnagFilters\' shared showSearch prop defaults to true, so Field Snag\'s mobile filter sheet is unaffected', /showSearch\s*=\s*true/.test(read('../components/snags/SnagFilters.jsx')));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
