import React, { useState, useMemo } from "react";
import {
  formatDate,
  computeCumulativeStatuses,
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  isWPReport,
} from "../utils/reportUtils";
import { calculateProjectProgress } from "../engines/progressEngine";
import { WORK_PACKAGES, WP_STATUS_SCORES } from "../config/workPackages";
import {
  PHASES as GANTT_PHASES,
  getWPsByPhase as getGanttWPsByPhase,
} from "../config/masterTaskLibrary";
import { parseAdditionalWorksCost, formatAdditionalWorksSum } from "../components/weekly/sharedUtils";
import { computePortfolioMissing } from "../engines/portfolioEngine";
import ProjectHeader      from "../components/weekly/ProjectHeader";
import KpiStrip           from "../components/weekly/KpiStrip";
import PhaseStepper       from "../components/weekly/PhaseStepper";
import AllClearStrip      from "../components/weekly/AllClearStrip";
import ReportLinksBlock   from "../components/weekly/ReportLinksBlock";
import AdditionalWorksBlock from "../components/weekly/AdditionalWorksBlock";
import PrevReportSummary  from "../components/weekly/PrevReportSummary";

// ─── ErrorBoundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="dashboard-summary-card">
        <h2>Rendering error</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#dc2626" }}>{String(this.state.error)}</pre>
      </div>
    );
    return this.props.children;
  }
}

// ─── Gantt-path WP structure (masterTaskLibrary phases → PhaseStepper shape) ──
const GANTT_WORK_PACKAGES = GANTT_PHASES
  .map(phase => {
    const wps = getGanttWPsByPhase(phase.id);
    if (wps.length === 0) return null;
    const taskNames = wps.map(wp => wp.label);
    return {
      id:     phase.id,
      name:   phase.label,
      tasks:  wps.map(wp => ({ name: wp.label, weight: 1 })),
      groups: [{ id: `${phase.id}.g`, name: phase.label, tasks: taskNames }],
    };
  })
  .filter(Boolean);

// ─── Old-format compat helpers ────────────────────────────────────────────────
const OLD_TO_WP_WEEKLY = {
  "Flooring installation":                                   { wpId: "finishes",      task: "Floor finishes" },
  "Drywall partition installation":                          { wpId: "construction",  task: "Partitions & drywall" },
  "Electrical systems installation":                         { wpId: "mep",           task: "Electrical conduits & cabling" },
  "HVAC systems installation":                               { wpId: "mep",           task: "HVAC ducts" },
  "Fire safety systems installation":                        { wpId: "mep",           task: "Fire suppression pipes" },
  "Low current systems installation":                        { wpId: "mep",           task: "Low current systems" },
  "Ceiling installation":                                    { wpId: "construction",  task: "Ceiling structures" },
  "Lighting installation":                                   { wpId: "finishes",      task: "Lighting fixtures" },
  "Furniture installation":                                  { wpId: "equipment",     task: "Furniture & loose items" },
  "Sprinkler system testing and commissioning":              { wpId: "commissioning", task: "Sprinkler testing & commissioning" },
  "Smoke detection system testing and commissioning":        { wpId: "commissioning", task: "Fire alarm testing" },
  "Emergency announcement system testing and commissioning": { wpId: "commissioning", task: "Integrated systems testing" },
  "HVAC system testing and commissioning":                   { wpId: "commissioning", task: "HVAC balancing & commissioning" },
  "Electrical system testing and commissioning":             { wpId: "commissioning", task: "Electrical testing & certification" },
  "Low current testing and commissioning":                   { wpId: "commissioning", task: "Security & access control testing" },
  "Staff training":                                          { wpId: "handover",      task: "Staff training" },
  "Manuals, certificates, test reports":                     { wpId: "handover",      task: "O&M manuals" },
  "Final cleaning":                                          { wpId: "handover",      task: "Final cleaning" },
  "Snag list resolution":                                    { wpId: "handover",      task: "Defects & snagging resolution" },
};

function mapOldToWPStatus(s) {
  if (!s) return null;
  const v = String(s).toLowerCase().trim();
  if (v === "completed" || v === "done" || v === "complete") return "Completed";
  if (v.includes("progress") || v === "started" || v === "active") return "In Progress";
  if (v === "delayed" || v === "blocked" || v === "behind") return "Delayed";
  return null;
}

function deriveWPStatusesFromOldReport(report) {
  if (!report) return {};
  const result = {};
  function set(wpId, taskName, rawStatus) {
    const status = mapOldToWPStatus(rawStatus);
    if (!status) return;
    if (!result[wpId]) result[wpId] = {};
    result[wpId][taskName] = { status };
  }
  set("demolition", "Demolition works", report.demolitionStatus);
  for (const [oldKey, { wpId, task }] of Object.entries(OLD_TO_WP_WEEKLY)) {
    const raw = report.constructionStatuses?.[oldKey]
      ?? report.testingStatuses?.[oldKey]
      ?? report.handoverStatuses?.[oldKey];
    set(wpId, task, raw);
  }
  return result;
}

function mergeOldDerivedStatuses(derivedList) {
  const result = {};
  for (const derived of derivedList) {
    for (const [wpId, tasks] of Object.entries(derived)) {
      if (!result[wpId]) result[wpId] = {};
      for (const [taskName, entry] of Object.entries(tasks)) {
        const cur = result[wpId][taskName];
        if (!cur || (WP_STATUS_SCORES[entry.status] ?? -1) > (WP_STATUS_SCORES[cur.status] ?? -1)) {
          result[wpId][taskName] = entry;
        }
      }
    }
  }
  return result;
}

// ─── Main component ───────────────────────────────────────────────────────────
function WeeklyReports({ projects, reports }) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedReportId,  setSelectedReportId]  = useState("");
  const [showMissingModal,  setShowMissingModal]  = useState(false);

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

  const prevReport = useMemo(() => {
    if (!selectedReport) return null;
    const sorted = [...projectReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
    const idx = sorted.findIndex(r => String(r.id) === effectiveReportId);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [selectedReport, projectReports, effectiveReportId]);

  const overallCumulative = useMemo(() => computeCumulativeStatuses(projectReports), [projectReports]);
  const overallProgress = useMemo(() => {
    const wpCum = computeWPCumulativeStatuses(projectReports);
    if (wpCum?.workPackageStatuses) return calculateProjectProgress(wpCum.workPackageStatuses);
    return estimateProgressFromStatuses(overallCumulative);
  }, [projectReports, overallCumulative]);

  const portfolioKpis = useMemo(() => computePortfolioMissing(projects, reports), [projects, reports]);

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

  // Merged WP statuses (current report + cumulative) — passed to PhaseStepper
  const mergedStatuses = useMemo(() => {
    if (!selectedReport) return {};
    const wpReport       = isWPReport(selectedReport);
    const current        = wpReport ? selectedReport.workPackageStatuses : deriveWPStatusesFromOldReport(selectedReport);
    const cumulative     = wpReport
      ? computeWPCumulativeStatuses(projectReports)?.workPackageStatuses
      : mergeOldDerivedStatuses(projectReports.map(deriveWPStatusesFromOldReport));
    const wpsConfig = wpReport ? GANTT_WORK_PACKAGES : WORK_PACKAGES;
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
  }, [selectedReport, projectReports]);

  const riskCount = (selectedReport?.risks || []).filter(Boolean).length;
  const displayWorkPackages = isWPReport(selectedReport) ? GANTT_WORK_PACKAGES : WORK_PACKAGES;

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
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="dashboard-filter-group">
              <label>Project</label>
              <select data-testid="project-select" value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setSelectedReportId(""); }}>
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
        </div>

        {/* Project header + KPI strip */}
        {selectedProject && (
          <>
            <ProjectHeader project={selectedProject} />
            <KpiStrip
              project={selectedProject}
              report={selectedReport}
              overallProgress={overallProgress}
              portfolioKpis={portfolioKpis}
              projectReportCount={projectReports.length}
              onMissingClick={() => setShowMissingModal(true)}
            />
          </>
        )}

        {/* Missing reports modal */}
        {showMissingModal && (
          <>
            <div onClick={() => setShowMissingModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 780, maxWidth: "96vw", maxHeight: "85vh", background: "#ffffff", zIndex: 1001, borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", borderTop: "3px solid #dc2626", border: "1px solid #e5e7eb" }}>
              <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #e5e7eb", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Missing Reports</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Projects with no report or last report older than 7 days</div>
                </div>
                <button type="button" onClick={() => setShowMissingModal(false)} style={{ padding: "5px 13px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close ×</button>
              </div>
              <div style={{ overflowY: "auto", padding: "16px 24px" }}>
                <table className="dashboard-table" style={{ width: "100%" }}>
                  <thead><tr><th>Project</th><th>Contractor</th><th>Last Report</th><th>Days Since</th><th>PM</th><th>Status</th></tr></thead>
                  <tbody>
                    {portfolioKpis.missing.sort((a, b) => (b.daysSinceReport ?? 999) - (a.daysSinceReport ?? 999)).map(({ project, latestReport, daysSinceReport }) => (
                      <tr key={project.id}>
                        <td><div style={{ fontWeight: 700, color: "#111827" }}>{project.storeCode}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>{project.shoppingMallName}</div></td>
                        <td style={{ fontSize: 12, color: "#374151" }}>{project.generalContractor || "—"}</td>
                        <td style={{ fontSize: 12, color: "#9ca3af" }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: "#dc2626", fontWeight: 700 }}>Never</span>}</td>
                        <td style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{daysSinceReport !== null ? `${daysSinceReport}d` : "—"}</td>
                        <td style={{ fontSize: 12, color: "#374151" }}>{project.projectManager || "—"}</td>
                        <td>{!latestReport ? <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", padding: "2px 8px", borderRadius: 7, background: "#fef2f2", border: "1px solid #fecaca" }}>Missing</span> : <span style={{ fontSize: 11, fontWeight: 700, color: "#d97706", padding: "2px 8px", borderRadius: 7, background: "#fffbeb", border: "1px solid #fde68a" }}>Overdue</span>}</td>
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
          <div className="dashboard-summary-card" style={{ color: "#9ca3af", padding: "32px 24px", textAlign: "center" }}>
            No weekly reports submitted yet for this project.
          </div>
        )}

        {/* Report detail */}
        {selectedReport && (
          <>
            <PrevReportSummary
              prevReport={prevReport}
              formatDate={formatDate}
              WORK_PACKAGES={displayWorkPackages}
              isWPReport={isWPReport}
              deriveWPStatusesFromOldReport={deriveWPStatusesFromOldReport}
            />

            <PhaseStepper
              workPackages={displayWorkPackages}
              mergedStatuses={mergedStatuses}
              reportKey={effectiveReportId}
            />

            <ReportLinksBlock report={selectedReport} />

            <AllClearStrip report={selectedReport} riskCount={riskCount} />

            <AdditionalWorksBlock
              entries={additionalWorksList.entries}
              total={additionalWorksList.total}
            />

            {/* Site photos */}
            {selectedReport.photos?.length > 0 && (
              <div className="dashboard-summary-card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#111827" }}>Site Photos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedReport.photos.map((photo, i) => (
                    <span key={i} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 13, background: "#f0f2ff", border: "1px solid #e0e7ff", color: "#374151" }}>
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
