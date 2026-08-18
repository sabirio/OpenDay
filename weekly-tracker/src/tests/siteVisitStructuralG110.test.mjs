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
const simpleList = read('../components/sitevisit/SimpleSiteVisitWorkList.jsx');
const legacyObservation = read('../components/sitevisit/LegacyPMTaskRow.jsx');
const styles = read('../index.css');
const workflow = read('../core/siteVisit/siteVisitWorkflowState.js');
const draft = read('../core/siteVisit/siteVisitDraftModel.js');
const submit = read('../core/siteVisit/submitSiteVisitModel.js');
const service = read('../services/siteVisitService.js');
const permissions = read('../auth/rolePermissions.js');
const app = read('../App.jsx');
const projectHub = read('../components/dashboard/DashboardProjectOverview.jsx');

console.log('\nG1.10 Site Visit structural contracts');

check('Site Visit presentation does not import engines, services, risk, snag, or action modules directly',
  !/from ['"][^'"]*(?:engines|services|core\/risk|core\/snags|actions)[^'"]*['"]/.test(page + view + simpleList + legacyObservation));
check('Discrepancy ownership remains in the canonical discrepancy engine behind the presentation hook and submit model',
  submit.includes("computeWPObservationDiscrepancy")
    && !/Math\.(?:abs|max|min)|reduce\(/.test(simpleList));
check('Progress defaults remain behind the canonical presentation facade',
  simpleList.includes('useProgressPresentation') && simpleList.includes('getDefaultProgressForGanttStatus'));
check('Partial visits still submit only explicitly touched work packages',
  page.includes('ganttTasks.filter(task => pmWpObservations[task.id])')
    && page.includes('Record at least one PM observation before submitting.'));
check('Untouched work packages stay visibly distinct from PM observations',
  simpleList.includes("const observedStatus = observation?.observed_status || ''")
    && simpleList.includes('Contractor reported:')
    && simpleList.includes('is-contractor'));
check('Displayed and persisted contractor reference comes from the latest contractor report line items',
  simpleList.includes('contractorReport?.wps')
    && page.includes('lastContractorReport?.wps')
    && page.includes('gc_status:         contractorEntry?.status')
    && page.includes('gc_progress:       contractorEntry?.progress_pct'));
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
  /PM: \[[^\]]*'site_visit'/.test(permissions)
    && !/Contractor: \[[^\]]*'site_visit'/.test(permissions)
    && !/Viewer: \[[^\]]*'site_visit'/.test(permissions));
check('Existing Site Visit route and Project handoff remain unchanged',
  app.includes('path="/site-visit/:projectId"')
    && app.includes('resource="site_visit"')
    && projectHub.includes('`/site-visit/${encodedProjectId}`'));
check('Canonical detail primitives dominate the recomposed field surface',
  ['AnalyticalSection', 'AttentionSurface', 'EvidenceLedger', 'MetadataRows'].every(name => view.includes(name)));
check('Visit-level evidence ownership is explicit and no per-WP evidence model is invented',
  view.includes('Photos belong to the visit record')
    && view.includes('Visit-level evidence')
    && !/(workPackageEvidence|wpEvidence|evidenceByWp)/.test(page + view));
check('Restored simple list removes navigation filters and keeps responsive rows',
  view.includes('SimpleSiteVisitWorkList')
    && !view.includes('SiteVisitTaskNavigator')
    && !page.includes('selectSiteVisitNavigation')
    && styles.includes('.site-visit-simple-task'));
check('Site Visit document uses the same 900px form width as Contractor Report',
  /\.contractor-report-document\s*\{[^}]*width:\s*min\(100%,\s*900px\)/.test(styles)
    && /\.site-visit-document\s*\{[^}]*width:\s*min\(100%,\s*900px\)/.test(styles));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
