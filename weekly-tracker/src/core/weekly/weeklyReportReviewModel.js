import {
  computeWPCumulativeStatuses,
  isWPReport,
  pickReconciledStatusEntry,
} from '../../utils/reportUtils.js';
import { calculateProgressComparison, computeProgressSeries } from '../../engines/progressEngine.js';
import { calculateWorkPackageDeltas, computePhaseChangeFlags, classifyPhases } from '../../engines/progressDeltaEngine.js';
import { computeAdditionalWorksSummary } from '../../engines/additionalWorksEngine.js';
import { deriveWPStatusesFromOldReport, mergeOldDerivedStatuses } from '../../engines/legacyReportEngine.js';
import { computeCanonicalMissingSummary } from '../../engines/portfolioEngine.js';
import { computeSiteVisitData, computeSiteVisitKpis } from '../../engines/siteVisitEngine.js';
import { SCHEDULE_CONFIG } from '../../config/scheduleConfig.js';
import { getScopedGanttWorkPackages, WORK_PACKAGES as GANTT_WPS, getDefaultPhaseWeights } from '../../config/masterTaskLibrary.js';
import { getScopeWPIds } from '../projects/scope/getScopeWPIds.js';
import { validateTemplate, explainFromSnapshot, explainLive, taskProgressFromStatuses } from '../projects/index.js';
import { constructionRetailV1 } from '../../domains/construction/templates/constructionRetailV1.js';
import { getScopedGanttWorkPackagesV2, isZonedTemplate } from '../projects/grouping/getWPGrouping.js';
import { buildV2ProgressTemplate } from '../projects/weights/buildV2ProgressTemplate.js';
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveEffectiveV2ZoneAreas } from '../projects/areas/resolveProjectArea.js';

const EXPLAIN_TEMPLATE_V1 = { workPackages: GANTT_WPS, phases: constructionRetailV1.phases };

function sortReportsAscending(reports) {
  return [...(reports ?? [])].sort(
    (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
  );
}

function buildProgressContext({ selectedProject, selectedReport, overallProgress }) {
  if (!selectedProject) {
    return { progressComparison: null, selectedProgress: null, currentHistRow: null };
  }

  const allHistory = [...(selectedProject.progressHistory ?? [])].sort(
    (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
  );
  const selectedDate = selectedReport?.reportingDate ?? null;
  const currentIdx = selectedDate
    ? allHistory.findIndex(r => r.recorded_at?.slice(0, 10) === selectedDate)
    : allHistory.length - 1;
  const currentHistRow = currentIdx >= 0 ? allHistory[currentIdx] : null;
  const prevHistRow = currentIdx > 0 ? allHistory[currentIdx - 1] : null;
  const selectedHistoryRows = [prevHistRow, currentHistRow].filter(Boolean);

  const selectedProgress = currentHistRow?.overall_progress ?? null;
  const refDate = selectedReport?.reportingDate ? new Date(selectedReport.reportingDate) : null;
  const progressComparison = calculateProgressComparison(
    selectedProject,
    selectedProgress !== null ? selectedProgress : overallProgress,
    selectedHistoryRows,
    SCHEDULE_CONFIG,
    refDate
  );

  return { progressComparison, selectedProgress, currentHistRow };
}

function buildMergedStatuses({ selectedReport, projectReports, scopedGanttWPs, legacyWorkPackages }) {
  if (!selectedReport) return {};

  const cutoff = selectedReport.reportingDate || selectedReport.submittedAt;
  const reportsUpTo = (projectReports ?? []).filter(
    r => (r.reportingDate || r.submittedAt) <= cutoff
  );
  const wpReport = isWPReport(selectedReport);
  const current = wpReport ? selectedReport.workPackageStatuses : deriveWPStatusesFromOldReport(selectedReport);
  const cumulative = wpReport
    ? computeWPCumulativeStatuses(reportsUpTo)?.workPackageStatuses
    : mergeOldDerivedStatuses(reportsUpTo.map(deriveWPStatusesFromOldReport));
  const wpsConfig = wpReport ? scopedGanttWPs : legacyWorkPackages;
  const merged = {};

  for (const wp of wpsConfig ?? []) {
    merged[wp.id] = {};
    for (const task of wp.tasks ?? []) {
      const entry = current?.[wp.id]?.[task.name] || {};
      const cumulativeEntry = cumulative?.[wp.id]?.[task.name] || {};
      merged[wp.id][task.name] = pickReconciledStatusEntry(entry, cumulativeEntry);
    }
  }

  return merged;
}

function buildPreviousMergedStatuses({ prevReport, selectedReport, projectReports }) {
  if (!prevReport) return null;

  const prevCutoff = prevReport.reportingDate || prevReport.submittedAt;
  const reportsUpToPrev = (projectReports ?? []).filter(
    r => (r.reportingDate || r.submittedAt) <= prevCutoff
  );

  if (isWPReport(selectedReport)) {
    return computeWPCumulativeStatuses(reportsUpToPrev)?.workPackageStatuses ?? null;
  }

  return mergeOldDerivedStatuses(reportsUpToPrev.map(deriveWPStatusesFromOldReport));
}

function buildExplainResult({ selectedReport, mergedStatuses, engineOutputs, selectedProject, overallProgress, isV2, v2ProgressTemplate, scopeTemplate }) {
  if (!isWPReport(selectedReport) || !mergedStatuses) return null;

  try {
    const explainTemplate = isV2 ? v2ProgressTemplate : EXPLAIN_TEMPLATE_V1;
    const taskProgress = taskProgressFromStatuses(mergedStatuses, explainTemplate);
    const histRow = engineOutputs?.currentHistRow;
    if (histRow?.snapshot?.effective_weights && Object.keys(histRow.snapshot.effective_weights).length > 0) {
      return explainFromSnapshot(histRow, taskProgress, explainTemplate);
    }

    const scopeWPIds = isV2
      ? getScopeWPIds(selectedProject?.scope, scopeTemplate.workPackages)
      : getScopeWPIds(selectedProject?.scope, GANTT_WPS);
    return explainLive(explainTemplate, scopeWPIds, taskProgress, overallProgress);
  } catch {
    return null;
  }
}

export function buildWeeklyReportReviewModel({
  selectedProject,
  selectedReport,
  prevReport,
  projectReports = [],
  siteVisits = [],
  overallProgress = 0,
  activeTemplate = null,
  legacyWorkPackages = [],
  canonicalResult = null,
}) {
  const templateIssues = activeTemplate ? validateTemplate(activeTemplate) : [];
  const templateErrorIssues = templateIssues.filter(issue => issue.severity === 'error');
  const portfolioKpis = computeCanonicalMissingSummary(canonicalResult ? [canonicalResult] : []);
  const engineOutputs = buildProgressContext({ selectedProject, selectedReport, overallProgress });
  const additionalWorksList = computeAdditionalWorksSummary(sortReportsAscending(projectReports));
  const scope = selectedProject?.scope ?? null;
  const isV2 = isZonedTemplate(selectedProject?.templateType);
  const scopeTemplate = resolveProjectScopeTemplate(selectedProject);
  const v2ProgressTemplate = isV2
    ? buildV2ProgressTemplate(resolveEffectiveV2ZoneAreas(selectedProject), scope?.zones ?? null, scope?.categories ?? null, scopeTemplate)
    : null;
  const scopedGanttWPs = isV2 ? getScopedGanttWorkPackagesV2(scope, scopeTemplate) : getScopedGanttWorkPackages(scope);
  const displayWorkPackages = isWPReport(selectedReport) ? scopedGanttWPs : legacyWorkPackages;
  const mergedStatuses = buildMergedStatuses({ selectedReport, projectReports, scopedGanttWPs, legacyWorkPackages });
  const prevMergedStatuses = buildPreviousMergedStatuses({ prevReport, selectedReport, projectReports });
  const wpDeltas = calculateWorkPackageDeltas(mergedStatuses, prevMergedStatuses);
  const phaseChangeFlags = computePhaseChangeFlags(wpDeltas);
  const progressSeries = computeProgressSeries(selectedProject?.progressHistory ?? []);

  const fullPhaseList = isWPReport(selectedReport)
    ? (isV2 ? getScopedGanttWorkPackagesV2(null, scopeTemplate) : getScopedGanttWorkPackages(null))
    : legacyWorkPackages;
  const scopePhaseIds = displayWorkPackages.map(p => p.id);
  const overrides = scope?.weightOverrides;
  const phaseWeights = isV2
    ? Object.fromEntries((v2ProgressTemplate?.phases ?? []).map(p => [p.id, p.progressWeight ?? 0]))
    : (overrides ? { ...getDefaultPhaseWeights(), ...overrides } : getDefaultPhaseWeights());
  const phaseClassifications = selectedProject
    ? classifyPhases(fullPhaseList, mergedStatuses, prevMergedStatuses, scopePhaseIds, phaseWeights)
    : [];

  const projectVisits = selectedProject
    ? siteVisits.filter(v => String(v.projectId) === String(selectedProject.id))
    : [];
  const svData = selectedProject
    ? computeSiteVisitData(projectVisits, [selectedProject], projectReports)
    : [];
  const svKpis = computeSiteVisitKpis(svData);
  const riskCount = (selectedReport?.risks || []).filter(Boolean).length;
  const explainResult = buildExplainResult({
    selectedReport,
    mergedStatuses,
    engineOutputs,
    selectedProject,
    overallProgress,
    isV2,
    v2ProgressTemplate,
    scopeTemplate,
  });

  return {
    templateIssues,
    templateErrorIssues,
    portfolioKpis,
    engineOutputs,
    additionalWorksList,
    scopedGanttWPs,
    mergedStatuses,
    prevMergedStatuses,
    wpDeltas,
    phaseChangeFlags,
    progressSeries,
    displayWorkPackages,
    phaseClassifications,
    svData,
    svKpis,
    riskCount,
    explainResult,
  };
}
