import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useAllRows } from "../hooks/useAllRows";
import { useWeeklyReportReviewModel } from "../hooks/useWeeklyReportReviewModel";
import { useWeeklyGanttTasks } from "../hooks/useWeeklyGanttTasks";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/shared/Toast.jsx";
import PrintHeader from "../components/print/PrintHeader";
import ExportButton from "../components/print/ExportButton";
// TODO wave4: WORK_PACKAGES here is the intentional legacy-report fallback
// (old flat-task vocabulary, no masterTaskLibrary equivalent) — see
// report model, gated on Gantt-vs-legacy report shape. Audited
// Wave 4 Step 4.6; not swapped, replacement is non-trivial. See TEMPLATE_MODEL.md.
// Already tracked and audited in src/tests/architectureGuard.test.mjs's
// ALLOWED_LEGACY_IMPORTERS — migrating would mean rewriting live
// legacy-report display behavior, out of scope for a lint cleanup and
// hard-constraint-protected (no business-semantics changes).
// eslint-disable-next-line no-restricted-imports
import { WORK_PACKAGES } from "../config/workPackages";
import { fetchActiveTemplate, fetchTemplateById } from "../data/templatesApi";
import ProjectHeader      from "../components/weekly/ProjectHeader";
import KpiStrip           from "../components/weekly/KpiStrip";
import AllClearStrip      from "../components/weekly/AllClearStrip";
import ReportLinksBlock   from "../components/weekly/ReportLinksBlock";
import AdditionalWorksBlock from "../components/weekly/AdditionalWorksBlock";
import AuditLogPanel from "../components/auditlog/AuditLogPanel";
import ProgressNarrative  from "../components/weekly/ProgressNarrative";
import ProgressChart      from "../components/weekly/ProgressChart";
import PhaseTimeline          from "../components/weekly/PhaseTimeline";
import SiteVisitComparison   from "../components/weekly/SiteVisitComparison";
import WeeklyReportsToolbar from "../components/weekly/WeeklyReportsToolbar";
import MissingReportsModal from "../components/weekly/MissingReportsModal";
import PhotoGallery from "../components/shared/PhotoGallery";
import ReportTruthBar from "../components/weekly/ReportTruthBar";
import WeeklyReportTabs from "../components/weekly/WeeklyReportTabs";
import ActionRequiredPanel from "../components/weekly/ActionRequiredPanel";
import PhaseBoard from "../components/weekly/PhaseBoard";
import CompactProgressTrend from "../components/weekly/CompactProgressTrend";

const GanttChart = React.lazy(() => import("../components/GanttChart"));

// ─── ErrorBoundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="dashboard-summary-card weekly-report-error" role="alert">
        <div>
          <h2>Weekly report could not render</h2>
          <p>The report data loaded, but this view hit a rendering problem. Refresh the page or try another report date.</p>
        </div>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--status-alert)", margin: 0 }}>{String(this.state.error)}</pre>
      </div>
    );
    return this.props.children;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
function WeeklyReports({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  const { user } = useAuth();
  const toast = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedReportId,  setSelectedReportId]  = useState("");
  const [showMissingModal,  setShowMissingModal]  = useState(false);
  const [showGantt,         setShowGantt]         = useState(false);
  const [expandedVisitId,   setExpandedVisitId]   = useState(null);
  const [activeReviewTab,   setActiveReviewTab]   = useState("overview");

  const effectiveProjectId = useMemo(() => {
    if (selectedProjectId && projects.some(p => String(p.id) === selectedProjectId))
      return selectedProjectId;
    return projects.length ? String(projects[0].id) : "";
  }, [selectedProjectId, projects]);

  const allRows = useAllRows(projects, reports, siteVisits, templatesById, activeTemplateFallback);
  const selectedRow = useMemo(
    () => allRows.find(r => String(r.project.id) === effectiveProjectId) ?? null,
    [allRows, effectiveProjectId]
  );

  const projectReports = useMemo(() =>
    [...(selectedRow?.canonical?.snapshot?.contractorReports ?? [])].reverse(),
    [selectedRow]
  );

  const effectiveReportId = useMemo(() => {
    if (selectedReportId && projectReports.some(r => String(r.id) === selectedReportId))
      return selectedReportId;
    return projectReports.length ? String(projectReports[0].id) : "";
  }, [selectedReportId, projectReports]);

  const selectedReport  = projectReports.find(r => String(r.id) === effectiveReportId);
  const selectedProject = selectedRow?.canonical?.snapshot?.project
    ?? projects.find(p => String(p.id) === effectiveProjectId);

  // `templateResult.key` tracks which (projectId, templateId) pair the
  // loaded template actually belongs to — `activeTemplate` is derived below
  // instead of being reset via a synchronous setState at the top of the
  // effect. The effect reads only the two primitives below (not the
  // `selectedProject` object itself, which can be a fresh reference each
  // render — one branch above is a `.find()` over `projects`, the other a
  // snapshot-derived object) so the dependency array is both exhaustive and
  // doesn't re-run on irrelevant object-identity churn.
  const [templateResult, setTemplateResult] = useState({ key: null, template: null });
  const resolvedProjectId = selectedProject?.id ?? null;
  const resolvedProjectTemplateId = selectedProject?.templateId ?? null;
  const selectedProjectTemplateKey = resolvedProjectId != null ? `${resolvedProjectId}:${resolvedProjectTemplateId ?? ''}` : null;

  useEffect(() => {
    if (resolvedProjectId == null) return;
    const key = selectedProjectTemplateKey;
    let alive = true;
    (async () => {
      let tpl;
      if (resolvedProjectTemplateId) {
        tpl = await fetchTemplateById(resolvedProjectTemplateId);
        if (!tpl) tpl = await fetchActiveTemplate();
      } else {
        tpl = await fetchActiveTemplate();
      }
      if (alive) setTemplateResult({ key, template: tpl });
    })();
    return () => { alive = false; };
  }, [resolvedProjectId, resolvedProjectTemplateId, selectedProjectTemplateKey]);

  const activeTemplate = selectedProjectTemplateKey && templateResult.key === selectedProjectTemplateKey
    ? templateResult.template
    : null;

  const prevReport = useMemo(() => {
    if (!selectedReport) return null;
    const sorted = [...projectReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
    const idx = sorted.findIndex(r => String(r.id) === effectiveReportId);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [selectedReport, projectReports, effectiveReportId]);

  // Single read model — progress (and risk/contScore/health/readiness, when
  // needed) comes from useAllRows(), same as Dashboard/Home. No local
  // recomputation of calculateProjectProgress() here; template resolution
  // (templatesById/activeTemplateFallback) is shared via useAllRows() so this
  // page can't silently diverge from Dashboard/Home again.
  const overallProgress = selectedRow?.canonical?.progress?.overallProgress ?? 0;

  const {
    templateErrorIssues,
    portfolioKpis,
    engineOutputs,
    additionalWorksList,
    mergedStatuses,
    wpDeltas,
    phaseChangeFlags,
    progressSeries,
    phaseClassifications,
    svData,
    svKpis,
    riskCount,
    explainResult,
  } = useWeeklyReportReviewModel({
    selectedProject,
    selectedReport,
    prevReport,
    projectReports,
    siteVisits,
    overallProgress,
    activeTemplate,
    legacyWorkPackages: WORK_PACKAGES,
    canonicalResult: selectedRow?.canonical ?? null,
  });

  const { tasks: ganttTasks, loading: ganttLoading, resizeTask } = useWeeklyGanttTasks({
    showGantt,
    projectId: effectiveProjectId,
  });

  const handleWPResize = useCallback(async (wpId, { plannedStart, plannedEnd, durationDays }) => {
    try {
      await resizeTask(wpId, { plannedStart, plannedEnd, durationDays });
    } catch (err) {
      console.error('[GanttResize] failed to save:', err);
      toast.error("Couldn't save the schedule change — please try dragging again.");
    }
  }, [resizeTask, toast]);
  const reviewTabs = [
    { id: "overview", label: "Overview" },
    { id: "verification", label: "Verification" },
    { id: "details", label: "Details & Evidence" },
  ];

  return (
    <ErrorBoundary>
      <div className="weekly-reports-surface">
        <div className="page-header weekly-page-title">
          <div>
            <h1>Weekly Reports</h1>
            <p>Verified weekly progress, PM comparison, risks, evidence, and opening readiness by project.</p>
          </div>
        </div>

        {selectedProject && (
          <PrintHeader
            title="Weekly Progress Report"
            projectLabel={`${selectedProject.storeCode}${selectedProject.shoppingMallName ? ` — ${selectedProject.shoppingMallName}` : ''}`}
            exportedBy={user?.email}
          />
        )}

        <WeeklyReportsToolbar
          projects={projects}
          projectReports={projectReports}
          selectedProjectId={selectedProjectId}
          selectedReportId={selectedReportId}
          selectedProject={selectedProject}
          showGantt={showGantt}
          onProjectChange={e => { setSelectedProjectId(e.target.value); setSelectedReportId(""); setShowGantt(false); }}
          onReportChange={e => setSelectedReportId(e.target.value)}
          onToggleGantt={() => setShowGantt(v => !v)}
          actions={selectedProject ? <ExportButton label="Export PDF" compact /> : null}
          statusLine={selectedProject ? (
            <span>
              <strong>{selectedProject.storeCode}</strong>
              {" · "}
              {selectedReport?.reportingDate || selectedReport?.submittedAt || "No report selected"}
              {" · Contractor "}
              {selectedReport ? "submitted" : "not submitted"}
              {" · PM "}
              {svKpis.totalVisits > 0 ? "verified" : "not verified"}
            </span>
          ) : null}
        />

        {selectedProject && (
          <section className="weekly-project-context">
            <ProjectHeader project={selectedProject} />
          </section>
        )}

        {selectedProject && (
          <section className="weekly-truth-console">
            {templateErrorIssues.length > 0 && (
              <div role="alert" className="weekly-template-alert">
                <span style={{ fontWeight: 700, color: 'var(--status-warn)' }}>
                  Active template is invalid — using built-in default weights. Fix in Template Editor:
                </span>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
                  {templateErrorIssues.map((e, idx) => (
                    <li key={idx} style={{ color: 'var(--status-warn)', marginTop: 3 }}>{e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <ReportTruthBar
              overallProgress={overallProgress}
              progressComparison={engineOutputs?.progressComparison}
              selectedProgress={engineOutputs?.selectedProgress}
              svKpis={svKpis}
              report={selectedReport}
              portfolioKpis={portfolioKpis}
              additionalWorksList={additionalWorksList}
            />
          </section>
        )}

        {selectedReport && (
          <WeeklyReportTabs
            tabs={reviewTabs}
            activeTab={activeReviewTab}
            onChange={setActiveReviewTab}
          />
        )}

        {/* Gantt chart */}
        {showGantt && selectedProject && (
          <div className="dashboard-summary-card" style={{ marginBottom: 16 }}>
            {ganttLoading ? (
              <div style={{ color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>Loading Gantt…</div>
            ) : ganttTasks.length === 0 ? (
              <div style={{ color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>No Gantt schedule generated yet for this project.</div>
            ) : (
              <React.Suspense fallback={<div style={{ color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>Loading Gantt chart...</div>}>
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
              </React.Suspense>
            )}
          </div>
        )}

        {/* Missing reports modal */}
        {showMissingModal && (
          <MissingReportsModal
            missingRows={[...portfolioKpis.missing].sort((a, b) => (b.daysSinceReport ?? 999) - (a.daysSinceReport ?? 999))}
            onClose={() => setShowMissingModal(false)}
          />
        )}
        {/* Empty state */}
        {projectReports.length === 0 && selectedProject && (
          <div className="dashboard-summary-card weekly-report-empty">
            <h2>No contractor reports yet</h2>
            <p>This project has no weekly contractor submission to verify. Once a report is submitted, progress, risks, photos, and PM comparison will appear here.</p>
          </div>
        )}

        {selectedReport && activeReviewTab === "overview" && (
          <section className="weekly-overview-console">
            <div className="weekly-overview-main">
              <ProgressNarrative
                progressComparison={engineOutputs?.progressComparison}
                selectedProgress={engineOutputs?.selectedProgress}
                explainResult={explainResult}
              />

              <PhaseBoard
                phases={phaseClassifications}
                phaseChangeFlags={phaseChangeFlags}
                wpDeltas={wpDeltas}
                mergedStatuses={mergedStatuses}
              >
                <PhaseTimeline
                  key={effectiveReportId}
                  phases={phaseClassifications}
                  mergedStatuses={mergedStatuses}
                  wpDeltas={wpDeltas}
                  phaseChangeFlags={phaseChangeFlags}
                />
              </PhaseBoard>
            </div>

            <div className="weekly-overview-side">
              <ActionRequiredPanel
                report={selectedReport}
                svKpis={svKpis}
                portfolioKpis={portfolioKpis}
                additionalWorksList={additionalWorksList}
              />
              <CompactProgressTrend
                series={progressSeries}
                scheduleStatus={engineOutputs?.progressComparison?.scheduleStatus}
                spi={engineOutputs?.progressComparison?.spi}
              />
            </div>
          </section>
        )}

        {selectedReport && activeReviewTab === "verification" && selectedProject && (
          <SiteVisitComparison
            svData={svData}
            svKpis={svKpis}
            expandedVisitId={expandedVisitId}
            onExpandedChange={setExpandedVisitId}
          />
        )}

        {selectedReport && activeReviewTab === "details" && (
          <section className="weekly-report-body">
            <KpiStrip
              project={selectedProject}
              report={selectedReport}
              overallProgress={overallProgress}
              portfolioKpis={portfolioKpis}
              projectReportCount={projectReports.length}
              onMissingClick={() => setShowMissingModal(true)}
            />

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

            <ReportLinksBlock report={selectedReport} />

            <AllClearStrip report={selectedReport} riskCount={riskCount} />

            <AdditionalWorksBlock
              entries={additionalWorksList.entries}
              total={additionalWorksList.total}
            />

            <PhotoGallery paths={selectedReport.photos} title="Site Photos" />

            {/* Audit log — who changed progress and when */}
            {selectedProject && (
              <div className="dashboard-summary-card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "var(--text-primary)" }}>Change History</div>
                <AuditLogPanel projectId={selectedProject.id} />
              </div>
            )}
          </section>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default WeeklyReports;
