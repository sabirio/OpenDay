import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`  OK ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}`);
  }
};

const page = read('../pages/SiteVisitReport.jsx');
const view = read('../components/sitevisit/SiteVisitFormView.jsx');
const navigator = read('../components/sitevisit/SiteVisitTaskNavigator.jsx');
const observation = read('../components/sitevisit/GanttPMTaskRow.jsx');
const workflow = read('../core/siteVisit/siteVisitWorkflowState.js');
const draft = read('../core/siteVisit/siteVisitDraftModel.js');
const submit = read('../core/siteVisit/submitSiteVisitModel.js');
const service = read('../services/siteVisitService.js');
const permissions = read('../auth/rolePermissions.js');
const app = read('../App.jsx');
const projectHub = read('../components/dashboard/DashboardProjectOverview.jsx');

console.log('\nG1.10 Site Visit structural contracts');

check('Site Visit presentation does not import engines, services, risk, snag, or action modules directly',
  !/from ['"][^'"]*(?:engines|services|core\/risk|core\/snags|actions)[^'"]*['"]/.test(page + view + navigator + observation));
check('Discrepancy ownership remains in the canonical discrepancy engine behind the presentation hook and submit model',
  observation.includes('useDiscrepancyPresentation')
    && submit.includes("computeWPObservationDiscrepancy")
    && !/Math\.(?:abs|max|min)|reduce\(/.test(observation));
check('Progress defaults remain behind the canonical presentation facade',
  observation.includes('useProgressPresentation') && observation.includes('getDefaultProgressForGanttStatus'));
check('Partial visits still submit only explicitly touched work packages',
  page.includes('ganttTasks.filter(task => pmWpObservations[task.id])')
    && page.includes('Record at least one PM observation before submitting.'));
check('Untouched work packages stay visibly distinct from PM observations',
  navigator.includes("label: 'Not observed'")
    && observation.includes("'Not recorded yet'")
    && observation.includes('hasObservation'));
check('Retry and idempotency remain owned by the existing workflow and atomic service',
  workflow.includes("case 'SUBMIT_FAILED'")
    && workflow.includes('idempotentReplay')
    && submit.includes('clientRequestId')
    && service.includes('submit_site_visit_atomic'));
check('Autosave and recovery remain owned by the shared workflow draft store',
  page.includes('saveSiteVisitDraft')
    && page.includes("window.addEventListener('beforeunload'")
    && draft.includes('workflowDraftStore.js'));
check('Canonical role facade still limits Site Visit to Admin and PM',
  permissions.includes("PM: ['dashboard', 'projects', 'weekly_reports', 'risk_engine', 'site_visit'")
    && permissions.includes("Contractor: ['contractor_report', 'snags', 'contractor_schedule']")
    && permissions.includes("Viewer: ['dashboard', 'snags']"));
check('Existing Site Visit route and Project handoff remain unchanged',
  app.includes('path="/site-visit/:projectId"')
    && app.includes('resource="site_visit"')
    && projectHub.includes('`/site-visit/${encodedProjectId}`'));
check('Canonical detail primitives dominate the recomposed field surface',
  ['AnalyticalSection', 'AttentionSurface', 'EvidenceLedger', 'MetadataRows'].every(name => view.includes(name))
    && observation.includes('AttentionSurface'));
check('Visit-level evidence ownership is explicit and no per-WP evidence model is invented',
  view.includes('Photos belong to the visit record')
    && view.includes('Visit-level evidence')
    && !/(workPackageEvidence|wpEvidence|evidenceByWp)/.test(page + view));
check('Mobile composition uses existing navigation state without changing domain semantics',
  navigator.includes('navigation.task')
    && navigator.includes('onNavigate(task.id)')
    && page.includes('selectSiteVisitNavigation(filteredTasks, currentItemId)'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
