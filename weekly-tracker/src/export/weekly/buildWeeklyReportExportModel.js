// Converts canonical application/domain data into a stable, renderer-ready
// WeeklyReportExportModel. This is a presentation-layer adapter, not a
// second analytics engine: every number here is read from
// buildWeeklyReportReviewModel() (the same pure function WeeklyReports.jsx
// itself calls) and the orchestrator result already attached to the
// project row (`canonicalResult`, i.e. runOpenDayOrchestrator() output) —
// nothing is recalculated. The PDF template consumes only what this file
// returns; it never reaches into React state, hooks, or Supabase itself.

import { buildWeeklyReportReviewModel } from '../../core/weekly/weeklyReportReviewModel.js';
import { createExportDocument } from '../model/exportDocument.js';
import { OPENDAY_EXPORT_PROFILE } from '../model/exportProfile.js';

function buildProjectSection(project) {
  if (!project) return null;
  return {
    storeCode: project.storeCode ?? null,
    shoppingMallName: project.shoppingMallName ?? null,
    city: project.city ?? null,
    country: project.country ?? null,
    projectManager: project.projectManager ?? null,
    generalContractor: project.generalContractor ?? null,
    targetOpeningDate: project.targetOpeningDate ?? null,
    projectType: project.projectType ?? null,
  };
}

function buildReportingPeriod(report, prevReport) {
  return {
    reportingDate: report?.reportingDate ?? null,
    submittedAt: report?.submittedAt ?? null,
    previousReportingDate: prevReport?.reportingDate ?? prevReport?.submittedAt ?? null,
  };
}

// Canonical progress facts — straight from computeCanonicalProgress() (via
// canonicalResult.progress) and calculateProgressComparison() (via
// reviewModel.engineOutputs.progressComparison). No field here is derived
// by this file; each is copied through under a stable name.
function buildProgressSection(canonicalResult, progressComparison, overallProgress) {
  const progress = canonicalResult?.progress ?? null;
  return {
    overallProgress: progress?.overallProgress ?? overallProgress ?? null,
    contractorProgress: progress?.contractorProgress ?? null,
    verifiedProgress: progress?.verifiedProgress ?? null,
    plannedProgress: progress?.plannedProgress ?? null,
    variance: progress?.variance ?? null,
    expectedProgress: progressComparison?.expectedPct ?? null,
    scheduleGap: progressComparison?.scheduleGap ?? null,
    scheduleStatus: progressComparison?.scheduleStatus ?? null,
    spi: progressComparison?.spi ?? null,
    deltaVsLastWeek: progressComparison?.deltaVsLastWeek ?? null,
  };
}

function buildReadinessSection(readiness) {
  if (!readiness) return null;
  return {
    status: readiness.status ?? null,
    daysToOpening: readiness.daysToOpening ?? null,
    targetDate: readiness.targetDate ?? null,
    verdict: readiness.verdict ?? null,
    blockerCount: readiness.blockerCount ?? 0,
    criticalBlockers: (readiness.criticalBlockers ?? []).map(b => ({
      task: b.task ?? null,
      status: b.status ?? null,
    })),
    softBlockers: (readiness.softBlockers ?? []).map(b => ({
      task: b.task ?? null,
      status: b.status ?? null,
    })),
  };
}

// Report-level risk assessment (risks/riskOwners/riskScale/riskDescription
// are flat fields on the contractor report, not a list of per-item risk
// objects — see ScheduleRiskSection.jsx / reportService.js normalizeReport).
// Blockers with real per-item structure come from readiness above instead.
function buildRisksSection(report, canonicalResult) {
  const riskScore = canonicalResult?.compatibility?.legacyState?.riskScore ?? null;
  return {
    level: riskScore?.level ?? null,
    score: riskScore?.score ?? null,
    assessment: {
      categories: report?.risks ?? [],
      owners: report?.riskOwners ?? [],
      scale: report?.riskScale ?? null,
      description: report?.riskDescription ?? null,
    },
  };
}

// Straight persisted contractor-report fields — no new reporting schema.
function buildUpcomingWorkSection(report) {
  if (!report) return null;
  return {
    nextWeekTop3: report.nextWeekTop3 ?? null,
    weekAfterTop3: report.weekAfterTop3 ?? null,
    activitiesBlocked: report.activitiesBlocked ?? null,
    delayReason: report.delayReason ?? null,
    supportRequired: report.supportRequired ?? null,
    supportTypes: report.supportTypes ?? [],
    supportDescription: report.supportDescription ?? null,
    finalComments: report.finalComments ?? null,
  };
}

// Phase/category breakdown — identical rows to what PhaseBoard renders on
// screen (classifyPhases() output), v1-phase or v2-zoned-category alike.
// out_of_scope phases are dropped: they carry no weight/progress meaning
// for a printed report.
function buildPhasesSection(phaseClassifications) {
  return (phaseClassifications ?? [])
    .filter(p => p.status !== 'out_of_scope')
    .map(p => ({
      id: p.id,
      name: p.name,
      pct: p.pct ?? 0,
      status: p.status ?? null,
      delta: p.delta ?? null,
      weight: p.weight ?? null,
    }));
}

// Raw evidence paths only — resolving these into displayable URLs requires
// a live, authenticated Supabase session (getSignedPhotoUrls()), which this
// pure builder deliberately does not perform. Callers resolve signed URLs
// at render time, right before handing the model to the PDF template.
function buildEvidenceSection(report) {
  return {
    photos: Array.isArray(report?.photos) ? report.photos.filter(p => typeof p === 'string' && p.trim()) : [],
  };
}

function buildHealthSection({ progress, readiness, risks }) {
  return {
    actualProgress: progress.overallProgress,
    expectedProgress: progress.expectedProgress,
    variance: progress.scheduleGap,
    scheduleStatus: progress.scheduleStatus,
    readinessStatus: readiness?.status ?? null,
    readinessVerdict: readiness?.verdict ?? null,
    daysToOpening: readiness?.daysToOpening ?? null,
    riskLevel: risks.level,
    riskScore: risks.score,
  };
}

/**
 * @param {object} input
 * @param {object} input.project - selectedProject (canonical Project row)
 * @param {object} input.report - selectedReport (the contractor report being exported)
 * @param {object|null} [input.prevReport]
 * @param {object[]} [input.projectReports]
 * @param {object[]} [input.siteVisits]
 * @param {object|null} [input.canonicalResult] - runOpenDayOrchestrator() output for this project (selectedRow.canonical)
 * @param {object|null} [input.activeTemplate]
 * @param {object[]} [input.legacyWorkPackages]
 * @param {number} [input.overallProgress]
 * @param {string} [input.generatedAt] - ISO timestamp; pass explicitly in tests for determinism
 * @returns {object} WeeklyReportExportModel
 */
export function buildWeeklyReportExportModel({
  project,
  report,
  prevReport = null,
  projectReports = [],
  siteVisits = [],
  canonicalResult = null,
  activeTemplate = null,
  legacyWorkPackages = [],
  overallProgress = 0,
  generatedAt,
} = {}) {
  const reviewModel = buildWeeklyReportReviewModel({
    selectedProject: project,
    selectedReport: report,
    prevReport,
    projectReports,
    siteVisits,
    overallProgress,
    activeTemplate,
    legacyWorkPackages,
    canonicalResult,
  });

  const progress = buildProgressSection(canonicalResult, reviewModel.engineOutputs?.progressComparison, overallProgress);
  const readiness = buildReadinessSection(canonicalResult?.readiness);
  const risks = buildRisksSection(report, canonicalResult);
  const health = buildHealthSection({ progress, readiness, risks });

  const document = createExportDocument({
    documentType: 'weekly-report',
    project: project ? { storeCode: project.storeCode ?? null } : null,
    branding: OPENDAY_EXPORT_PROFILE,
    generatedAt,
  });

  return {
    document,
    project: buildProjectSection(project),
    reportingPeriod: buildReportingPeriod(report, prevReport),
    health,
    progress,
    readiness,
    risks,
    phases: buildPhasesSection(reviewModel.phaseClassifications),
    upcomingWork: buildUpcomingWorkSection(report),
    evidence: buildEvidenceSection(report),
  };
}
