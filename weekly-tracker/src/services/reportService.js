/**
 * @deprecated reportService
 *
 * The `reports` table is a legacy table. New contractor reports are written
 * to `contractor_reports` + `contractor_report_wps`.
 *
 * All DB-querying exports (getAll(), create()) were dead code (zero external
 * callers) and were removed in the dead-code cleanup pass, along with the
 * private helpers/imports that existed only to support them (validateReport,
 * fromDB, toDB, buildWeightSnapshot, and the supabase/progressEngine/
 * templatesApi/computeEffectiveWeights/ganttService imports they alone
 * required). normalizeReport() is the one export that's still live —
 * ContractorReport.jsx uses it as a pure shape-normalizer, no DB access
 * involved. This file no longer performs any Supabase I/O.
 */

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
