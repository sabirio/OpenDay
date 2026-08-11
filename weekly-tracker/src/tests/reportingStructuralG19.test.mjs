import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`  OK ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}`);
  }
};
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const contractor = read('../pages/ContractorReport.jsx');
const formParts = read('../components/contractor/FormParts.jsx');
const weekly = read('../pages/WeeklyReports.jsx');
const weeklyMaster = read('../components/weekly/WeeklyReportsMasterList.jsx');
const permissions = read('../auth/rolePermissions.js');
const submission = read('../core/contractorReport/submitContractorReportModel.js');
const submissionBuilder = read('../core/contractorReport/buildContractorReportSubmission.js');
const app = read('../App.jsx');
const home = read('../pages/Home.jsx');
const project = read('../components/dashboard/DashboardProjectOverview.jsx');

console.log('\nG1.9 reporting structural contracts');

check('Contractor Report uses the canonical AnalyticalSection primitive through its form-section facade',
  formParts.includes('shared/detail/AnalyticalSection.jsx') && formParts.includes('<AnalyticalSection'));
check('Contractor workflow distinguishes reporting reality, forward commitments, commercial exceptions, and evidence',
  ['Reporting reality', 'Forward commitments', 'Commercial exceptions', 'Evidence and submission'].every(label => contractor.includes(label)));
check('Contractor page delegates submission and calculations to the existing reporting model',
  contractor.includes('submitContractorReportModel')
    && submission.includes('buildContractorReportSubmission')
    && submissionBuilder.includes('calculateProjectProgressResult'));
check('Contractor page does not import a reporting, progress, risk, cost, approval, or workflow engine',
  !/from ["'][^"']*\/engines\//.test(contractor)
    && !/(new Report|Approval|Cost|Urgency)Engine/.test(contractor));
check('Commercial capture remains explicitly contractor-reported rather than an approval model',
  read('../components/contractor/SupportWorksSection.jsx').includes('does not approve commercial changes')
    && !/(approveAdditionalWorks|commercialApproval|variationOrderStatus)/.test(contractor));
check('Weekly Reports retains canonical MasterDetail ownership and Project query handoff',
  weekly.includes('<MasterDetailLayout')
    && weekly.includes('useSearchParams')
    && weekly.includes('linkedProjectId = searchParams.get("project")')
    && weekly.includes('useState(() => (linkedProjectId ? "detail" : "master"))'));
check('Weekly Reports provides an intentional clear action for presentation filters',
  weeklyMaster.includes('onClearFilters') && weeklyMaster.includes('Clear filters'));
check('Report status remains sourced from the existing report-context model',
  weekly.includes('describeReportContext(selectedReport') && weekly.includes('selectedReportSummary.statusLabel'));
check('Role permissions remain centralized with Contractor submit and PM/Admin review boundaries',
  permissions.includes("PM: ['dashboard', 'projects', 'weekly_reports'")
    && permissions.includes("Contractor: ['contractor_report'")
    && permissions.includes("Viewer: ['dashboard', 'snags']"));
check('Routes keep Weekly review and Contractor editing as separate guarded resources',
  app.includes('path="/weekly-reports"')
    && app.includes('resource="weekly_reports"')
    && app.includes('path="/contractor-report/:projectId"')
    && app.includes('resource="contractor_report"'));
check('G1.9 does not redesign Home or the G1.8 Project workflow handoffs',
  home.includes('Home')
    && project.includes('/weekly-reports?project=${encodedProjectId}')
    && project.includes('/risk?project=${encodedProjectId}'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
