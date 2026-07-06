import { formatDate } from "../../utils/reportUtils";

export default function WeeklyReportsToolbar({
  projects,
  projectReports,
  selectedProjectId,
  selectedReportId,
  selectedProject,
  showGantt,
  onProjectChange,
  onReportChange,
  onToggleGantt,
  statusLine,
  actions,
}) {
  return (
    <div className="dashboard-toolbar weekly-reports-toolbar">
      <div className="weekly-reports-toolbar-fields">
        <div className="dashboard-filter-group">
          <label>Project</label>
          <select data-testid="project-select" value={selectedProjectId} onChange={onProjectChange}>
            {projects.map(p => (
              <option key={p.id} value={String(p.id)}>{p.storeCode} - {p.shoppingMallName}</option>
            ))}
          </select>
        </div>
        <div className="dashboard-filter-group">
          <label>Report date</label>
          <select data-testid="report-date-select" value={selectedReportId} onChange={onReportChange} disabled={!projectReports.length}>
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
      <div className="weekly-toolbar-actions">
        {actions}
        {selectedProject && (
        <button
          type="button"
          onClick={onToggleGantt}
          style={{
            minHeight: 40, padding: "7px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: `1.5px solid ${showGantt ? "var(--status-done)" : "var(--border)"}`,
            background: showGantt ? "var(--status-done-bg)" : "var(--accent-subtle)",
            color: showGantt ? "var(--status-done)" : "var(--text-primary)",
            flexShrink: 0,
          }}
        >
          {showGantt ? "Hide Gantt" : "View Gantt ->"}
        </button>
        )}
      </div>
      {statusLine && <div className="weekly-control-status">{statusLine}</div>}
    </div>
  );
}
