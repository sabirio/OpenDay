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
      {selectedProject && (
        <div className="weekly-toolbar-actions">
          <button
            type="button"
            className={showGantt ? "weekly-gantt-button is-active" : "weekly-gantt-button"}
            onClick={onToggleGantt}
          >
            {showGantt ? "Hide Gantt" : "View Gantt ->"}
          </button>
        </div>
      )}
    </div>
  );
}
