import { supabase } from '../lib/supabase';

function validateReport(report) {
  if (!report?.projectId) throw new Error('projectId is required');
  if (!report?.reportingDate) throw new Error('reportingDate is required');
  if (report.reportingDate && isNaN(Date.parse(report.reportingDate))) {
    throw new Error(`Invalid reportingDate: ${report.reportingDate}`);
  }
  if (!report?.projectScheduleStatus) throw new Error('projectScheduleStatus is required');
}

function fromDB(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    storeCode: row.store_code,
    projectName: row.project_name,
    contractor: row.contractor,
    submittedAt: row.submitted_at,
    reportingDate: row.reporting_date,
    currentPhase: row.current_phase,
    currentPhases: row.current_phases || (row.current_phase ? [row.current_phase] : []),
    demolitionStatus: row.demolition_status,
    constructionStatuses: row.construction_statuses || {},
    testingStatuses: row.testing_statuses || {},
    contractorHandoverStatus: row.contractor_handover_status,
    handoverStatuses: row.handover_statuses || {},
    projectScheduleStatus: row.project_schedule_status,
    risks: row.risks || [],
    riskOwners: row.risk_owners || [],
    riskScale: row.risk_scale,
    riskDescription: row.risk_description,
    supportRequired: row.support_required,
    supportTypes: row.support_types || [],
    supportDescription: row.support_description,
    additionalWorks: row.additional_works,
    additionalWorksParty: row.additional_works_party,
    additionalWorksDescription: row.additional_works_description,
    additionalWorksCost: row.additional_works_cost,
    nextWeekTop3: row.next_week_top3,
    weekAfterTop3: row.week_after_top3,
    activitiesBlocked: row.activities_blocked,
    delayReason: row.delay_reason,
    pendingIssues: row.pending_issues,
    finalComments: row.final_comments,
    declarationConfirmed: row.declaration_confirmed,
    photos: row.photos || [],
    workPackageStatuses: row.work_package_statuses || null,
    currentPackages: row.current_packages || [],
    previousReportId: row.previous_report_id || null,
  };
}

function toDB(report) {
  const phases = report.currentPhases || (report.currentPhase ? [report.currentPhase] : []);
  return {
    project_id: report.projectId,
    store_code: report.storeCode || null,
    project_name: report.projectName || null,
    contractor: report.contractor || null,
    submitted_at: report.submittedAt || new Date().toISOString(),
    reporting_date: report.reportingDate || null,
    current_phase: phases[0] || report.currentPhase || null,
    current_phases: phases,
    demolition_status: report.demolitionStatus || null,
    construction_statuses: report.constructionStatuses || {},
    testing_statuses: report.testingStatuses || {},
    contractor_handover_status: report.contractorHandoverStatus || null,
    handover_statuses: report.handoverStatuses || {},
    project_schedule_status: report.projectScheduleStatus || null,
    risks: report.risks || [],
    risk_owners: report.riskOwners || [],
    risk_scale: report.riskScale || null,
    risk_description: report.riskDescription || null,
    support_required: report.supportRequired || null,
    support_types: report.supportTypes || [],
    support_description: report.supportDescription || null,
    additional_works: report.additionalWorks || null,
    additional_works_party: report.additionalWorksParty || null,
    additional_works_description: report.additionalWorksDescription || null,
    additional_works_cost: report.additionalWorksCost || null,
    next_week_top3: report.nextWeekTop3 || null,
    week_after_top3: report.weekAfterTop3 || null,
    activities_blocked: report.activitiesBlocked || null,
    delay_reason: report.delayReason || null,
    pending_issues: report.pendingIssues || null,
    final_comments: report.finalComments || null,
    declaration_confirmed: report.declarationConfirmed || false,
    photos: report.photos || [],
    work_package_statuses: report.workPackageStatuses || null,
    current_packages: report.currentPackages || [],
    previous_report_id: report.previousReportId || null,
  };
}

export async function getAll() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data.map(fromDB);
}

export async function create(report) {
  validateReport(report);
  const { data, error } = await supabase
    .from('reports')
    .insert([toDB(report)])
    .select()
    .single();
  if (error) throw error;
  return fromDB(data);
}
