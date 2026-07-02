import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  formatDate,
  computeCumulativeStatuses,
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  isWPReport,
} from "../utils/reportUtils";
import { calculateProjectProgress, calculateProgressComparison, computeProgressSeries } from "../engines/progressEngine";
import { calculateWorkPackageDeltas, computePhaseChangeFlags, classifyPhases } from "../engines/progressDeltaEngine";
import { computeProjectRiskScore } from "../engines/riskEngine";
import { computeContractorScores } from "../engines/contractorEngine";
import { computeProjectHealth } from "../engines/projectHealthEngine";
import { computeOpeningReadiness } from "../engines/openingReadinessEngine";
import { SCHEDULE_CONFIG } from "../config/scheduleConfig";
import { WORK_PACKAGES, WP_STATUS_SCORES } from "../config/workPackages";
import { getScopedGanttWorkPackages, WORK_PACKAGES as GANTT_WPS, getDefaultPhaseWeights } from "../config/masterTaskLibrary";
import { getScopeWPIds } from "../core/projects/scope/getScopeWPIds";
import { parseAdditionalWorksCost, formatAdditionalWorksSum } from "../components/weekly/sharedUtils";
import { deriveWPStatusesFromOldReport, mergeOldDerivedStatuses } from "../engines/legacyReportEngine";
import { computePortfolioMissing } from "../engines/portfolioEngine";
import { computeSiteVisitData, computeSiteVisitKpis } from "../engines/siteVisitEngine";
import { getProjectGantt, updateWPDates } from "../services/ganttService";
import { fetchActiveTemplate, fetchTemplateById } from "../data/templatesApi";
import { isTemplateValid, validateTemplate, explainFromSnapshot, explainLive, taskProgressFromStatuses } from "../core/projects";
import { constructionRetailV1 } from "../domains/construction/templates/constructionRetailV1";
import GanttChart         from "../components/GanttChart";
import ProjectHeader      from "../components/weekly/ProjectHeader";
import KpiStrip           from "../components/weekly/KpiStrip";
import AllClearStrip      from "../components/weekly/AllClearStrip";
import ReportLinksBlock   from "../components/weekly/ReportLinksBlock";
import AdditionalWorksBlock from "../components/weekly/AdditionalWorksBlock";
import ProgressNarrative  from "../components/weekly/ProgressNarrative";
import ProgressChart      from "../components/weekly/ProgressChart";
import PhaseTimeline          from "../components/weekly/PhaseTimeline";
import SiteVisitComparison   from "../components/weekly/SiteVisitComparison";

// ─── ErrorBoundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="dashboard-summary-card">
        <h2>Rendering error</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--status-alert)" }}>{String(this.state.error)}</pre>
      </div>
    );
    return this.props.children;
  }
}

// Stable labeled template for explain layer: GANTT_WPS (flat, with label+phaseId+duration_pct)
// + constructionRetailV1.phases (with label+progressWeight). Labels are resolved here so the
// explain output carries readable strings; ProgressNarrative needs no id→label lookup.
const EXPLAIN_TEMPLATE = { workPackages: GANTT_WPS, phases: constructionRetailV1.phases };

// ─── Main component ───────────────────────────────────────────────────────────
function WeeklyReports({ projects, reports, siteVisits = [] }) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedReportId,  setSelectedReportId]  = useState("");
  const [showMissingModal,  setShowMissingModal]  = useState(false);
  const [showGantt,         setShowGantt]         = useState(false);
  const [ganttTasks,        setGanttTasks]        = useState([]);
  const [ganttLoading,      setGanttLoading]      = useState(false);
  const [expandedVisitId,   setExpandedVisitId]   = useState(null);
  const [activeTemplate,    setActiveTemplate]    = useState(null);

  const effectiveProjectId = useMemo(() => {
    if (selectedProjectId && projects.some(p => String(p.id) === selectedProjectId))
      return selectedProjectId;
    return projects.length ? String(projects[0].id) : "";
  }, [selectedProjectId, projects]);

  const projectReports = useMemo(() =>
    reports
      .filter(r => String(r.projectId) === effectiveProjectId)
      .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt)),
    [reports, effectiveProjectId]
  );

  const effectiveReportId = useMemo(() => {
    if (selectedReportId && projectReports.some(r => String(r.id) === selectedReportId))
      return selectedReportId;
    return projectReports.length ? String(projectReports[0].id) : "";
  }, [selectedReportId, projectReports]);

  const selectedReport  = projectReports.find(r => String(r.id) === effectiveReportId);
  const selectedProject = projects.find(p => String(p.id) === effectiveProjectId);

  useEffect(() => {
    if (!selectedProject) { setActiveTemplate(null); return; }
    let alive = true;
    (async () => {
      let tpl = null;
      if (selectedProject.templateId) {
        tpl = await fetchTemplateById(selectedProject.templateId);
        if (!tpl) tpl = await fetchActiveTemplate();
      } else {
        tpl = await fetchActiveTemplate();
      }
      if (alive) setActiveTemplate(tpl);
    })();
    return () => { alive = false; };
  }, [selectedProject?.id, selectedProject?.templateId]);

  const prevReport = useMemo(() => {
    if (!selectedReport) return null;
    const sorted = [...projectReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
    const idx = sorted.findIndex(r => String(r.id) === effectiveReportId);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [selectedReport, projectReports, effectiveReportId]);

  const overallCumulative = useMemo(() => computeCumulativeStatuses(projectReports), [projectReports]);

  const templateIssues = useMemo(
    () => (activeTemplate ? validateTemplate(activeTemplate) : []),
    [activeTemplate]
  );
  const gatedTemplate = useMemo(
    () => (activeTemplate && isTemplateValid(activeTemplate) ? activeTemplate : null),
    [activeTemplate]
  );

  const overallProgress = useMemo(() => {
    const wpCum = computeWPCumulativeStatuses(projectReports);
    if (wpCum?.workPackageStatuses) {
      const scopeWPIds = getScopeWPIds(selectedProject?.scope, GANTT_WPS);
      const phaseWeightOverrides = selectedProject?.scope?.weightOverrides ?? null;
      return calculateProjectProgress(wpCum.workPackageStatuses, scopeWPIds, phaseWeightOverrides, gatedTemplate);
    }
    return estimateProgressFromStatuses(overallCumulative);
  }, [projectReports, overallCumulative, selectedProject, gatedTemplate]);

  const portfolioKpis = useMemo(
    () => computePortfolioMissing(selectedProject ? [selectedProject] : [], reports),
    [selectedProject, reports]
  );

  // Engine outputs — wired after overallProgress so we can pass it in.
  // risk and contScore computed before health because health depends on both.
  // projSiteVisits filtered here; engines expect pre-filtered arrays (do not filter internally).
  const engineOutputs = useMemo(() => {
    if (!selectedProject) return null;
    const projSiteVisits = siteVisits.filter(v => String(v.projectId) === String(selectedProject.id));
    const latestReport   = projectReports[0] ?? null; // projectReports sorted newest-first
    const wpCum          = computeWPCumulativeStatuses(projectReports);

    // Select the two history rows relevant to the selected report:
    // "current" = row whose date matches selectedReport, "previous" = the row just before it.
    // All history rows are available (projectService no longer caps at 2).
    const allHistory  = [...(selectedProject.progressHistory ?? [])].sort(
      (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at) // oldest → newest
    );
    const selectedDate  = selectedReport?.reportingDate ?? null;
    const currentIdx    = selectedDate
      ? allHistory.findIndex(r => r.recorded_at?.slice(0, 10) === selectedDate)
      : allHistory.length - 1; // no report selected → use most recent
    const currentHistRow = currentIdx >= 0 ? allHistory[currentIdx] : null;
    const prevHistRow    = currentIdx > 0  ? allHistory[currentIdx - 1] : null;
    const selectedHistoryRows = [prevHistRow, currentHistRow].filter(Boolean);

    // Use the history row's stored progress for the selected week, not the live cumulative.
    // Also pass the report date as referenceDate so expectedPct is evaluated at that point in time.
    const selectedProgress = currentHistRow?.overall_progress ?? null;
    const refDate = selectedReport?.reportingDate ? new Date(selectedReport.reportingDate) : null;
    const progressComparison = calculateProgressComparison(
      selectedProject,
      selectedProgress !== null ? selectedProgress : overallProgress,
      selectedHistoryRows,
      SCHEDULE_CONFIG,
      refDate
    );
    const risk      = computeProjectRiskScore(selectedProject, projectReports, overallProgress, projSiteVisits);
    const contScore = computeContractorScores(selectedProject, projectReports, projSiteVisits);
    const health    = computeProjectHealth(risk, overallProgress, contScore, latestReport);
    const readiness = computeOpeningReadiness(wpCum, selectedProject.targetOpeningDate ?? null);
    return { progressComparison, risk, contScore, health, readiness, selectedProgress, currentHistRow };
  }, [selectedProject, selectedReport, overallProgress, projectReports, siteVisits]);

  const additionalWorksList = useMemo(() => {
    const sorted = [...projectReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
    const entries = sorted.reduce((acc, r, idx) => {
      if (r.additionalWorks !== "Yes") return acc;
      const { value, currency } = parseAdditionalWorksCost(r.additionalWorksCost);
      acc.push({ num: idx + 1, date: r.reportingDate || new Date(r.submittedAt).toLocaleDateString("en-GB"), cost: r.additionalWorksCost || "—", description: r.additionalWorksDescription || "", party: r.additionalWorksParty || "", costValue: value, currency });
      return acc;
    }, []);
    const totalSum    = entries.reduce((s, e) => s + (e.costValue || 0), 0);
    const allCurrencies = [...new Set(entries.map(e => e.currency).filter(Boolean))];
    const currency    = allCurrencies.length === 1 ? allCurrencies[0] : "";
    const total       = entries.length > 0 ? formatAdditionalWorksSum(totalSum, currency) : null;
    return { entries, total };
  }, [projectReports]);

  const scopedGanttWPs = useMemo(
    () => getScopedGanttWorkPackages(selectedProject?.scope ?? null),
    [selectedProject]
  );

  // Merged WP statuses (current report + cumulative up to selected date) — passed to PhaseStepper
  const mergedStatuses = useMemo(() => {
    if (!selectedReport) return {};
    const cutoff = selectedReport.reportingDate || selectedReport.submittedAt;
    const reportsUpTo = projectReports.filter(
      r => (r.reportingDate || r.submittedAt) <= cutoff
    );
    const wpReport       = isWPReport(selectedReport);
    const current        = wpReport ? selectedReport.workPackageStatuses : deriveWPStatusesFromOldReport(selectedReport);
    const cumulative     = wpReport
      ? computeWPCumulativeStatuses(reportsUpTo)?.workPackageStatuses
      : mergeOldDerivedStatuses(reportsUpTo.map(deriveWPStatusesFromOldReport));
    const wpsConfig = wpReport ? scopedGanttWPs : WORK_PACKAGES;
    const merged = {};
    for (const wp of wpsConfig) {
      merged[wp.id] = {};
      for (const task of wp.tasks) {
        const e = current?.[wp.id]?.[task.name]    || {};
        const c = cumulative?.[wp.id]?.[task.name] || {};
        const eScore = WP_STATUS_SCORES[e.status] ?? -1;
        const cScore = WP_STATUS_SCORES[c.status] ?? -1;
        merged[wp.id][task.name] = cScore >= eScore ? (c.status ? c : e) : (e.status ? e : c);
      }
    }
    return merged;
  }, [selectedReport, projectReports, scopedGanttWPs]);

  // Explain result — reconstructs WHY the overall % is what it is.
  // Prefers explainFromSnapshot when the history row has frozen effective_weights (version-proof).
  // Falls back to explainLive (re-derived weights) for unsaved/legacy reports.
  // Only wired for Gantt-format reports where label→wpId mapping is reliable.
  const explainResult = useMemo(() => {
    if (!isWPReport(selectedReport) || !mergedStatuses) return null;
    try {
      const taskProgress = taskProgressFromStatuses(mergedStatuses, EXPLAIN_TEMPLATE);
      const histRow = engineOutputs?.currentHistRow;
      if (histRow?.snapshot?.effective_weights && Object.keys(histRow.snapshot.effective_weights).length > 0) {
        return explainFromSnapshot(histRow, taskProgress, EXPLAIN_TEMPLATE);
      }
      const scopeWPIds = getScopeWPIds(selectedProject?.scope, GANTT_WPS);
      return explainLive(EXPLAIN_TEMPLATE, scopeWPIds, taskProgress, overallProgress);
    } catch { return null; }
  }, [selectedReport, mergedStatuses, engineOutputs, selectedProject, overallProgress]);

  // Cumulative WP statuses as of the previous report's date — used for WP delta calculation.
  const prevMergedStatuses = useMemo(() => {
    if (!prevReport) return null;
    const prevCutoff = prevReport.reportingDate || prevReport.submittedAt;
    const reportsUpToPrev = projectReports.filter(
      r => (r.reportingDate || r.submittedAt) <= prevCutoff
    );
    if (isWPReport(selectedReport)) {
      return computeWPCumulativeStatuses(reportsUpToPrev)?.workPackageStatuses ?? null;
    }
    return mergeOldDerivedStatuses(reportsUpToPrev.map(deriveWPStatusesFromOldReport));
  }, [prevReport, selectedReport, projectReports]);

  const wpDeltas = useMemo(
    () => calculateWorkPackageDeltas(mergedStatuses, prevMergedStatuses),
    [mergedStatuses, prevMergedStatuses]
  );

  const phaseChangeFlags = useMemo(
    () => computePhaseChangeFlags(wpDeltas),
    [wpDeltas]
  );

  const progressSeries = useMemo(
    () => computeProgressSeries(selectedProject?.progressHistory ?? []),
    [selectedProject]
  );

  const displayWorkPackages = isWPReport(selectedReport) ? scopedGanttWPs : WORK_PACKAGES;

  const phaseClassifications = useMemo(() => {
    if (!selectedProject) return [];
    // Full (unscoped) list so out-of-scope phases are still emitted in the timeline.
    const fullPhaseList = isWPReport(selectedReport) ? getScopedGanttWorkPackages(null) : WORK_PACKAGES;
    const scopePhaseIds = displayWorkPackages.map(p => p.id);
    const scope = selectedProject.scope ?? null;
    const ov = scope?.weightOverrides;
    const phaseWeights = ov ? { ...getDefaultPhaseWeights(), ...ov } : getDefaultPhaseWeights();
    return classifyPhases(fullPhaseList, mergedStatuses, prevMergedStatuses, scopePhaseIds, phaseWeights);
  }, [selectedProject, selectedReport, displayWorkPackages, mergedStatuses, prevMergedStatuses]);

  const svData = useMemo(() => {
    if (!selectedProject) return [];
    const projVisits = siteVisits.filter(v => String(v.projectId) === String(selectedProject.id));
    return computeSiteVisitData(projVisits, [selectedProject], projectReports);
  }, [selectedProject, siteVisits, projectReports]);
  const svKpis = useMemo(() => computeSiteVisitKpis(svData), [svData]);

  useEffect(() => {
    if (!showGantt || !effectiveProjectId) return;
    setGanttLoading(true);
    getProjectGantt(effectiveProjectId)
      .then(tasks => setGanttTasks(tasks || []))
      .catch(() => setGanttTasks([]))
      .finally(() => setGanttLoading(false));
  }, [showGantt, effectiveProjectId]);

  const handleWPResize = useCallback(async (wpId, { plannedStart, plannedEnd, durationDays }) => {
    setGanttTasks(prev => prev.map(t =>
      t.id === wpId
        ? { ...t, earlyStart: new Date(plannedStart), earlyFinish: new Date(plannedEnd), duration_days: durationDays }
        : t
    ));
    try {
      await updateWPDates(effectiveProjectId, wpId, { plannedStart, plannedEnd, durationDays });
    } catch (err) {
      console.error('[GanttResize] failed to save:', err);
    }
  }, [effectiveProjectId]);

  const riskCount = (selectedReport?.risks || []).filter(Boolean).length;

  return (
    <ErrorBoundary>
      <div>
        {/* Page title */}
        <div className="page-header">
          <div>
            <h1>Weekly Reports</h1>
            <p>Contractor progress reports — detailed operational status by project and week.</p>
          </div>
        </div>

        {/* Selectors toolbar */}
        <div className="dashboard-toolbar">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1 }}>
            <div className="dashboard-filter-group">
              <label>Project</label>
              <select data-testid="project-select" value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setSelectedReportId(""); setShowGantt(false); }}>
                {projects.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.storeCode} — {p.shoppingMallName}</option>
                ))}
              </select>
            </div>
            <div className="dashboard-filter-group">
              <label>Report date</label>
              <select data-testid="report-date-select" value={selectedReportId} onChange={e => setSelectedReportId(e.target.value)} disabled={!projectReports.length}>
                {projectReports.length === 0
                  ? <option value="">No reports yet</option>
                  : projectReports.map(r => (
                      <option key={r.id} value={String(r.id)}>
                        {r.reportingDate || formatDate(r.submittedAt)}
                      </option>
                    ))
                }
              </select>
            </div>
          </div>
          {selectedProject && (
            <button
              type="button"
              onClick={() => setShowGantt(v => !v)}
              style={{
                padding: "7px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${showGantt ? "var(--status-done)" : "var(--border)"}`,
                background: showGantt ? "var(--status-done-bg)" : "var(--accent-subtle)",
                color: showGantt ? "var(--status-done)" : "var(--text-primary)",
                flexShrink: 0,
              }}
            >
              {showGantt ? "Hide Gantt" : "View Gantt →"}
            </button>
          )}
        </div>

        {/* Project header + KPI strip + Progress Narrative */}
        {selectedProject && (
          <>
            <ProjectHeader project={selectedProject} />
            {templateIssues.filter(i => i.severity === 'error').length > 0 && (
              <div role="alert" style={{
                background: 'var(--status-warn-bg)', border: '1px solid var(--border)',
                borderLeft: '4px solid var(--status-warn)', borderRadius: 10,
                padding: '10px 16px', marginBottom: 14, fontSize: 13,
              }}>
                <span style={{ fontWeight: 700, color: 'var(--status-warn)' }}>
                  Active template is invalid — using built-in default weights. Fix in Template Editor:
                </span>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
                  {templateIssues.filter(i => i.severity === 'error').map((e, idx) => (
                    <li key={idx} style={{ color: 'var(--status-warn)', marginTop: 3 }}>{e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'stretch', marginBottom: 16 }}>
              <KpiStrip
                project={selectedProject}
                report={selectedReport}
                overallProgress={overallProgress}
                portfolioKpis={portfolioKpis}
                projectReportCount={projectReports.length}
                onMissingClick={() => setShowMissingModal(true)}
              />
              {selectedReport && (
                <ProgressNarrative
                  progressComparison={engineOutputs?.progressComparison}
                  selectedProgress={engineOutputs?.selectedProgress}
                  explainResult={explainResult}
                />
              )}
            </div>
          </>
        )}

        {/* Gantt chart */}
        {showGantt && selectedProject && (
          <div className="dashboard-summary-card" style={{ marginBottom: 16 }}>
            {ganttLoading ? (
              <div style={{ color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>Loading Gantt…</div>
            ) : ganttTasks.length === 0 ? (
              <div style={{ color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>No Gantt schedule generated yet for this project.</div>
            ) : (
              <GanttChart
                project={selectedProject}
                tasks={ganttTasks}
                keyDates={{
                  constructionStartDate:      selectedProject.constructionStartDate,
                  constructionEndDate:        selectedProject.constructionEndDate,
                  targetOpeningDate:          selectedProject.targetOpeningDate,
                  forecastOpeningDate:        selectedProject.forecastOpeningDate,
                  constructionCompletionDate: selectedProject.constructionCompletionDate,
                }}
                onWPResize={handleWPResize}
              />
            )}
          </div>
        )}

        {/* Missing reports modal */}
        {showMissingModal && (
          <>
            <div onClick={() => setShowMissingModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 780, maxWidth: "96vw", maxHeight: "85vh", background: "var(--bg-surface)", zIndex: 1001, borderRadius: 16, boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", borderTop: "3px solid var(--status-alert)", border: "1px solid var(--border)" }}>
              <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>Missing Reports</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Projects with no report or last report older than 7 days</div>
                </div>
                <button type="button" onClick={() => setShowMissingModal(false)} style={{ padding: "5px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--accent-subtle)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close ×</button>
              </div>
              <div style={{ overflowY: "auto", padding: "16px 24px" }}>
                <table className="dashboard-table" style={{ width: "100%" }}>
                  <thead><tr><th>Project</th><th>Contractor</th><th>Last Report</th><th>Days Since</th><th>PM</th><th>Status</th></tr></thead>
                  <tbody>
                    {portfolioKpis.missing.sort((a, b) => (b.daysSinceReport ?? 999) - (a.daysSinceReport ?? 999)).map(({ project, latestReport, daysSinceReport }) => (
                      <tr key={project.id}>
                        <td><div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{project.storeCode}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{project.shoppingMallName}</div></td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{project.generalContractor || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: "var(--status-alert)", fontWeight: 700 }}>Never</span>}</td>
                        <td style={{ fontSize: 13, fontWeight: 700, color: "var(--status-alert)" }}>{daysSinceReport !== null ? `${daysSinceReport}d` : "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{project.projectManager || "—"}</td>
                        <td>{!latestReport ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-alert)", padding: "2px 8px", borderRadius: 7, background: "var(--status-alert-bg)", border: "1px solid var(--border)" }}>Missing</span> : <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-warn)", padding: "2px 8px", borderRadius: 7, background: "var(--status-warn-bg)", border: "1px solid var(--border)" }}>Overdue</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {projectReports.length === 0 && selectedProject && (
          <div className="dashboard-summary-card" style={{ color: "var(--text-muted)", padding: "32px 24px", textAlign: "center" }}>
            No weekly reports submitted yet for this project.
          </div>
        )}

        {/* Report detail */}
        {selectedReport && (
          <>
            <ProgressChart
              series={progressSeries}
              scheduleStatus={engineOutputs?.progressComparison?.scheduleStatus}
              spi={engineOutputs?.progressComparison?.spi}
              reportCount={projectReports.length}
              latestDate={projectReports[0]?.reportingDate}
            />

            <PhaseTimeline
              key={effectiveReportId}
              phases={phaseClassifications}
              mergedStatuses={mergedStatuses}
              wpDeltas={wpDeltas}
              phaseChangeFlags={phaseChangeFlags}
            />

            {selectedProject && (
              <SiteVisitComparison
                svData={svData}
                svKpis={svKpis}
                expandedVisitId={expandedVisitId}
                onExpandedChange={setExpandedVisitId}
              />
            )}

            <ReportLinksBlock report={selectedReport} />

            <AllClearStrip report={selectedReport} riskCount={riskCount} />

            <AdditionalWorksBlock
              entries={additionalWorksList.entries}
              total={additionalWorksList.total}
            />

            {/* Site photos */}
            {selectedReport.photos?.length > 0 && (
              <div className="dashboard-summary-card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "var(--text-primary)" }}>Site Photos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedReport.photos.map((photo, i) => (
                    <span key={i} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 13, background: "var(--accent-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      {typeof photo === "string" ? photo : photo?.name || `Photo ${i + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default WeeklyReports;
