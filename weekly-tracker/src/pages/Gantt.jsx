import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateSchedule,
  computeProjectProgress,
  daysBetween,
  generateWarnings,
  mapStatusToProgress,
  mapStatusToTaskStatus,
  STATUS_COLORS,
} from "../engines/ganttEngine";
import {
  generateFromTemplate,
  getTaskReportStatus,
  GANTT_TEMPLATES,
} from "../config/scheduleTemplates";
import { computeCumulativeStatuses } from "../utils/reportUtils";
import GanttChart from "../components/GanttChart";

const SEV_STYLE = {
  CRITICAL: { bg: "#450a0a", border: "#7f1d1d", text: "#fca5a5" },
  HIGH:     { bg: "#431407", border: "#c2410c", text: "#fdba74" },
  MEDIUM:   { bg: "#422006", border: "#b45309", text: "#fcd34d" },
  LOW:      { bg: "#1e293b", border: "#334155", text: "#94a3b8" },
};

function Gantt({ projects = [], reports = [], siteVisits = [] }) {
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    projects.length ? String(projects[0].id) : ""
  );
  const [offsetOverrides, setOffsetOverrides] = useState({});
  const [showWarnings,   setShowWarnings]   = useState(false); // modal, closed by default
  const [showComparison, setShowComparison] = useState(true);

  const selectedProject = projects.find((p) => String(p.id) === selectedProjectId) || null;
  const projectStart    = selectedProject?.constructionStartDate || new Date().toISOString().slice(0, 10);
  const openingDate     = selectedProject?.targetOpeningDate || null;
  const templateId      = selectedProject?.ganttTemplate || "fitout";

  const projectReports    = useMemo(() => reports.filter((r) => String(r.projectId) === selectedProjectId), [reports, selectedProjectId]);
  const projectSiteVisits = useMemo(() => siteVisits.filter((s) => String(s.projectId) === selectedProjectId), [siteVisits, selectedProjectId]);

  const latestSiteVisit = useMemo(() => {
    if (!projectSiteVisits.length) return null;
    return [...projectSiteVisits].sort(
      (a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt)
    )[0];
  }, [projectSiteVisits]);

  const gcStatuses = useMemo(() => computeCumulativeStatuses(projectReports), [projectReports]);

  useEffect(() => {
    const stored = localStorage.getItem(`gantt_offsets_${selectedProjectId}`);
    setOffsetOverrides(stored ? JSON.parse(stored) : {});
  }, [selectedProjectId]);

  // Base tasks from template
  const baseTasks = useMemo(() => generateFromTemplate(templateId), [templateId]);

  // Scale template durations to span the actual construction period (start → end date).
  // Without scaling, the default template durations (~26 days) would not fill a 6-month project.
  const scaledBaseTasks = useMemo(() => {
    if (!baseTasks.length) return baseTasks;
    const startDate = selectedProject?.constructionStartDate;
    const endDate   = selectedProject?.constructionEndDate;
    if (!startDate || !endDate) return baseTasks;

    const actualDuration = daysBetween(startDate, endDate);
    if (actualDuration <= 1) return baseTasks;

    // Find template's natural critical path length (max earlyFinish at 1:1 scale)
    const tempScheduled   = calculateSchedule(baseTasks, startDate);
    const templateLength  = Math.max(...tempScheduled.map((t) => t.earlyFinish ?? 0), 1);
    const scale           = actualDuration / templateLength;

    return baseTasks.map((task) => ({
      ...task,
      duration: Math.max(1, Math.round(task.duration * scale)),
    }));
  }, [baseTasks, selectedProject?.constructionStartDate, selectedProject?.constructionEndDate]);

  // Merge GC report + PM site visit statuses into each scaled task
  const mergedTasks = useMemo(() => {
    return scaledBaseTasks.map((task) => {
      const gcStatus = getTaskReportStatus(gcStatuses, task.reportPhase, task.reportKey);

      let pmStatus = null;
      if (latestSiteVisit && task.reportPhase) {
        switch (task.reportPhase) {
          case "demolition":   pmStatus = latestSiteVisit.demolitionStatus || null; break;
          case "construction": pmStatus = latestSiteVisit.constructionStatuses?.[task.reportKey] || null; break;
          case "testing":      pmStatus = latestSiteVisit.testingStatuses?.[task.reportKey] || null; break;
          case "handover":     pmStatus = latestSiteVisit.handoverStatuses?.[task.reportKey] || null; break;
        }
      }

      const gcProgress     = mapStatusToProgress(gcStatus);
      const pmProgress     = mapStatusToProgress(pmStatus);
      const hasDiscrepancy = !!gcStatus && !!pmStatus && gcProgress !== pmProgress;
      const activeStatus   = gcStatus || pmStatus;
      const progress       = gcStatus ? gcProgress : pmProgress;
      const status         = mapStatusToTaskStatus(activeStatus);
      const override       = offsetOverrides[task.id];

      return {
        ...task,
        gcStatus, pmStatus, gcProgress, pmProgress, hasDiscrepancy, progress, status,
        ...(override !== undefined ? { _manualOffset: override } : {}),
      };
    });
  }, [scaledBaseTasks, gcStatuses, latestSiteVisit, offsetOverrides]);

  const scheduledTasks  = useMemo(() => calculateSchedule(mergedTasks, projectStart), [mergedTasks, projectStart]);
  const projectProgress = useMemo(() => computeProjectProgress(scheduledTasks), [scheduledTasks]);
  const warnings        = useMemo(() => generateWarnings(scheduledTasks, openingDate, projectReports), [scheduledTasks, openingDate, projectReports]);

  const handleTaskMove = useCallback((taskId, newEarlyStart) => {
    setOffsetOverrides((prev) => {
      const next = { ...prev, [taskId]: newEarlyStart };
      localStorage.setItem(`gantt_offsets_${selectedProjectId}`, JSON.stringify(next));
      return next;
    });
  }, [selectedProjectId]);

  const discrepancyCount = scheduledTasks.filter((t) => t.hasDiscrepancy).length;
  const criticalCount    = scheduledTasks.filter((t) => t.critical).length;
  const completedCount   = scheduledTasks.filter((t) => t.status === "Completed").length;
  const templateLabel    = GANTT_TEMPLATES[templateId]?.label || templateId;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Schedule</h1>
          <p>CPM Gantt chart driven by GC weekly reports and PM site visits.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        {projects.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Project</div>
            <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ height: 36, padding: "0 12px", borderRadius: 9, border: "1.5px solid #334155", fontSize: 13, color: "#e2e8f0", background: "#1e293b", outline: "none", cursor: "pointer", minWidth: 220 }}>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.storeCode} — {p.shoppingMallName}</option>
              ))}
            </select>
          </div>
        )}
        {selectedProject && (
          <div style={{ fontSize: 12, padding: "8px 14px", background: "#1e293b", border: "1px solid #334155", borderRadius: 9, color: "#94a3b8" }}>
            Template: <strong style={{ color: "#e2e8f0" }}>{templateLabel}</strong>
          </div>
        )}
      </div>

      {/* Project info bar */}
      {selectedProject && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "12px 20px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, marginBottom: 16, fontSize: 12 }}>
          {[
            ["Store",       selectedProject.storeCode             || "—"],
            ["Start",       selectedProject.constructionStartDate  || "—"],
            ["End",         selectedProject.constructionEndDate    || "—"],
            ["Opening",     selectedProject.targetOpeningDate      || "—"],
            ["PM",          selectedProject.projectManager         || "—"],
            ["GC Reports",  projectReports.length],
            ["Site Visits", projectSiteVisits.length],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: 2 }}>{l}</div>
              <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPI row — Warnings card opens modal on click */}
      {scheduledTasks.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { label: "Progress",      value: `${projectProgress}%`, color: "#2563eb",  onClick: null },
            { label: "Critical Path", value: criticalCount,          color: criticalCount    > 0 ? "#dc2626" : "#22c55e", onClick: null },
            { label: "Completed",     value: completedCount,         color: completedCount   > 0 ? "#22c55e" : "#475569", onClick: null },
            { label: "Discrepancies", value: discrepancyCount,       color: discrepancyCount > 0 ? "#f59e0b" : "#22c55e", onClick: null },
            { label: "Warnings",      value: warnings.length,        color: warnings.length  > 0 ? "#d97706" : "#22c55e",
              onClick: warnings.length > 0 ? () => setShowWarnings(true) : null },
          ].map(({ label, value, color, onClick }) => (
            <div key={label}
              onClick={onClick || undefined}
              style={{
                background: "#1e293b", borderRadius: 12, border: "1px solid #334155",
                padding: "12px 16px", flex: 1, minWidth: 110, borderTop: `3px solid ${color}`,
                cursor: onClick ? "pointer" : "default",
                transition: "opacity 0.1s",
              }}
              onMouseEnter={e => { if (onClick) e.currentTarget.style.opacity = "0.8"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 7 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              {onClick && <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>click to view</div>}
            </div>
          ))}
        </div>
      )}

      {/* Gantt chart */}
      {scheduledTasks.length > 0 ? (
        <div className="dashboard-summary-card" style={{ marginBottom: 16 }}>
          <GanttChart
            tasks={scheduledTasks}
            projectStart={projectStart}
            openingDate={openingDate}
            onTaskMove={handleTaskMove}
            onTaskSelect={null}
          />
        </div>
      ) : (
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "48px 24px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, color: "#64748b" }}>
            {projects.length === 0 ? "No projects available." : "Select a project to view its schedule."}
          </div>
        </div>
      )}

      {/* GC vs PM comparison table */}
      {scheduledTasks.length > 0 && (
        <div className="dashboard-summary-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>GC Report vs PM Observation</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                {latestSiteVisit
                  ? `Latest site visit: ${new Date(latestSiteVisit.visitDate || latestSiteVisit.submittedAt).toLocaleDateString("en-GB")}`
                  : "No PM site visit yet"}
                {" · "}
                {projectReports.length > 0 ? `${projectReports.length} GC report(s)` : "No GC reports yet"}
              </div>
            </div>
            <button type="button" onClick={() => setShowComparison((v) => !v)}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
              {showComparison ? "▲ hide" : "▼ show"}
            </button>
          </div>

          {showComparison && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="dashboard-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>#</th><th>Work Package</th><th>Phase</th>
                    <th>GC Reported</th><th>PM Observed</th>
                    <th>Match</th><th>Progress</th><th>Task Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledTasks.filter((t) => t.reportPhase).map((task, idx) => {
                    const sc         = STATUS_COLORS[task.status] || "#475569";
                    const noData     = !task.gcStatus && !task.pmStatus;
                    const matchColor = noData ? "#475569" : task.hasDiscrepancy ? "#dc2626" : "#16a34a";
                    const matchLabel = noData ? "No data" : task.hasDiscrepancy ? "Mismatch" : "Match";
                    return (
                      <tr key={task.id} style={{ background: task.hasDiscrepancy ? "rgba(220,38,38,0.05)" : undefined }}>
                        <td style={{ color: "#64748b" }}>{idx + 1}</td>
                        <td style={{ color: "#f1f5f9", fontWeight: 600 }}>{task.name}</td>
                        <td>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#0f172a", color: "#94a3b8", border: "1px solid #334155" }}>
                            {task.reportPhase}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: task.gcStatus ? "#60a5fa" : "#475569" }}>{task.gcStatus || "—"}</td>
                        <td style={{ fontSize: 12, color: task.pmStatus ? "#34d399" : "#475569" }}>{task.pmStatus || "—"}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, color: matchColor }}>{task.hasDiscrepancy ? "⚠ " : ""}{matchLabel}</span></td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 48, background: "#334155", borderRadius: 3, height: 5, overflow: "hidden" }}>
                              <div style={{ width: `${task.progress}%`, height: "100%", background: sc, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: "#e2e8f0" }}>{task.progress}%</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: sc + "20", color: sc, border: `1px solid ${sc}44` }}>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Warnings modal */}
      {showWarnings && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowWarnings(false)}
        >
          <div
            style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: 24, maxWidth: 680, width: "95vw", maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>Schedule Warnings</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{warnings.length} issue{warnings.length !== 1 ? "s" : ""} found</div>
              </div>
              <button type="button" onClick={() => setShowWarnings(false)}
                style={{ background: "#0f172a", border: "1.5px solid #334155", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 18, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ×
              </button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {warnings.map((w, i) => {
                const s = SEV_STYLE[w.severity] || SEV_STYLE.LOW;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: s.text, padding: "3px 8px", borderRadius: 5, background: "rgba(255,255,255,0.06)", border: `1px solid ${s.border}`, flexShrink: 0, marginTop: 1 }}>
                      {w.severity}
                    </span>
                    <div>
                      {w.taskName && <div style={{ fontSize: 11, fontWeight: 700, color: s.text, marginBottom: 2 }}>{w.taskName}</div>}
                      <div style={{ fontSize: 12, color: s.text }}>{w.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Gantt;
