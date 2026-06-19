import { supabase } from "../lib/supabase";
import { calculateProjectProgress } from "../engines/progressEngine";

const DEFAULT_REPORT_VALUES = {
  projectScheduleStatus: "On Track",
  supportRequired: "No",
  activitiesBlocked: "No",
  additionalWorks: "No",
  declarationConfirmed: false,
};

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function normalizeObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];

  return photos.map((photo) => {
    if (typeof photo === "string") return photo;
    if (photo?.name) return photo.name;
    return photo;
  });
}

export function normalizeReport(report = {}) {
  const currentPackages = normalizeArray(report.currentPackages);

  const currentPhase =
    report.currentPhase ||
    currentPackages?.[0]?.phase ||
    currentPackages?.[0]?.phaseName ||
    currentPackages?.[0]?.packageName ||
    "";

  const currentPhases =
    report.currentPhases?.length > 0
      ? report.currentPhases
      : currentPhase
        ? [currentPhase]
        : [];

  return {
    id: report.id ?? null,

    projectId: report.projectId,
    storeCode: report.storeCode || null,
    projectName: report.projectName || null,
    contractor: report.contractor || null,

    submittedAt: report.submittedAt || new Date().toISOString(),
    reportingDate: report.reportingDate,

    currentPhase,
    currentPhases,
    currentPackages,

    demolitionStatus: report.demolitionStatus || null,
    constructionStatuses: normalizeObject(report.constructionStatuses),
    testingStatuses: normalizeObject(report.testingStatuses),
    contractorHandoverStatus: report.contractorHandoverStatus || null,
    handoverStatuses: normalizeObject(report.handoverStatuses),

    projectScheduleStatus:
      report.projectScheduleStatus || DEFAULT_REPORT_VALUES.projectScheduleStatus,

    risks: normalizeArray(report.risks),
    riskOwners: normalizeArray(report.riskOwners),
    riskScale: report.riskScale || null,
    riskDescription: report.riskDescription || "",

    supportRequired:
      report.supportRequired || DEFAULT_REPORT_VALUES.supportRequired,
    supportTypes: normalizeArray(report.supportTypes),
    supportDescription: report.supportDescription || "",

    additionalWorks:
      report.additionalWorks || DEFAULT_REPORT_VALUES.additionalWorks,
    additionalWorksParty: report.additionalWorksParty || "",
    additionalWorksDescription: report.additionalWorksDescription || "",
    additionalWorksCost: report.additionalWorksCost || "",

    nextWeekTop3: report.nextWeekTop3 || "",
    weekAfterTop3: report.weekAfterTop3 || "",

    activitiesBlocked:
      report.activitiesBlocked || DEFAULT_REPORT_VALUES.activitiesBlocked,
    delayReason: report.delayReason || "",

    pendingIssues: report.pendingIssues || "",
    finalComments: report.finalComments || "",

    declarationConfirmed:
      report.declarationConfirmed ?? DEFAULT_REPORT_VALUES.declarationConfirmed,

    photos: normalizePhotos(report.photos),

    previousReportId: report.previousReportId || null,

    workPackageStatuses: report.workPackageStatuses || null,
    lookAheadNotes: report.lookAheadNotes || "",
  };
}

function validateReport(report) {
  if (!report?.projectId) throw new Error("projectId is required");
  if (!report?.reportingDate) throw new Error("reportingDate is required");

  if (report.reportingDate && isNaN(Date.parse(report.reportingDate))) {
    throw new Error(`Invalid reportingDate: ${report.reportingDate}`);
  }

  if (!report?.projectScheduleStatus) {
    throw new Error("projectScheduleStatus is required");
  }
}

function fromDB(row) {
  return normalizeReport({
    id: row.id,
    projectId: row.project_id,
    storeCode: row.store_code,
    projectName: row.project_name,
    contractor: row.contractor,
    submittedAt: row.submitted_at,
    reportingDate: row.reporting_date,

    currentPhase: row.current_phase,
    currentPhases: row.current_phases,
    currentPackages: row.current_packages,

    demolitionStatus: row.demolition_status,
    constructionStatuses: row.construction_statuses,
    testingStatuses: row.testing_statuses,
    contractorHandoverStatus: row.contractor_handover_status,
    handoverStatuses: row.handover_statuses,

    projectScheduleStatus: row.project_schedule_status,

    risks: row.risks,
    riskOwners: row.risk_owners,
    riskScale: row.risk_scale,
    riskDescription: row.risk_description,

    supportRequired: row.support_required,
    supportTypes: row.support_types,
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
    photos: row.photos,

    previousReportId: row.previous_report_id,

    workPackageStatuses: row.work_package_statuses || null,
    lookAheadNotes: row.look_ahead_notes || "",
  });
}

function toDB(report) {
  const normalized = normalizeReport(report);

  validateReport(normalized);

  return {
    project_id: normalized.projectId,
    store_code: normalized.storeCode,
    project_name: normalized.projectName,
    contractor: normalized.contractor,

    submitted_at: normalized.submittedAt,
    reporting_date: normalized.reportingDate,

    current_phase: normalized.currentPhase || null,
    current_phases: normalized.currentPhases,
    current_packages: normalized.currentPackages,

    demolition_status: normalized.demolitionStatus,
    construction_statuses: normalized.constructionStatuses,
    testing_statuses: normalized.testingStatuses,
    contractor_handover_status: normalized.contractorHandoverStatus,
    handover_statuses: normalized.handoverStatuses,

    project_schedule_status: normalized.projectScheduleStatus,

    risks: normalized.risks,
    risk_owners: normalized.riskOwners,
    risk_scale: normalized.riskScale,
    risk_description: normalized.riskDescription,

    support_required: normalized.supportRequired,
    support_types: normalized.supportTypes,
    support_description: normalized.supportDescription,

    additional_works: normalized.additionalWorks,
    additional_works_party: normalized.additionalWorksParty,
    additional_works_description: normalized.additionalWorksDescription,
    additional_works_cost: normalized.additionalWorksCost,

    next_week_top3: normalized.nextWeekTop3,
    week_after_top3: normalized.weekAfterTop3,

    activities_blocked: normalized.activitiesBlocked,
    delay_reason: normalized.delayReason,

    pending_issues: normalized.pendingIssues,
    final_comments: normalized.finalComments,

    declaration_confirmed: normalized.declarationConfirmed,
    photos: normalized.photos,

    previous_report_id: normalized.previousReportId,

    work_package_statuses: normalized.workPackageStatuses || null,
    look_ahead_notes: normalized.lookAheadNotes || null,
  };
}

export async function getAll() {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) throw error;

  return data.map(fromDB);
}

export async function create(report, cumulativeProgress = null) {
  const normalized = normalizeReport(report);
  validateReport(normalized);

  const { data, error } = await supabase
    .from("reports")
    .insert([toDB(normalized)])
    .select()
    .single();

  if (error) throw error;

  const savedReport = fromDB(data);

  try {
    // Use the cumulative value passed by the caller (same number shown on screen).
    // Fall back to single-report calculation only when caller omits it.
    const calculatedProgress = cumulativeProgress !== null
      ? cumulativeProgress
      : normalized.workPackageStatuses
        ? calculateProjectProgress(normalized.workPackageStatuses)
        : 0;

    const d = new Date(normalized.reportingDate);
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);

    await supabase.from('progress_history').insert({
      project_id:       normalized.projectId,
      week_number:      weekNumber,
      overall_progress: calculatedProgress,
      spi:              null,
      snapshot: {
        phases:       normalized.currentPhases,
        blockers:     normalized.activitiesBlocked,
        work_packages: normalized.workPackageStatuses,
      },
    });
  } catch (histErr) {
    console.warn('[progress_history] snapshot write failed:', histErr);
  }

  return savedReport;
}