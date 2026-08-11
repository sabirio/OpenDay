import MetadataRows from "../shared/detail/MetadataRows.jsx";

function ReportHeaderCard({ project, weekInfo, weekPct, lastReport, daysSinceLast, projectReportsCount }) {
  const lastReportDate = lastReport
    ? new Date(lastReport.reportingDate || lastReport.submittedAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;
  const contextItems = [
    project.generalContractor && { label: "General contractor", value: project.generalContractor },
    project.projectManager && { label: "Client PM", value: project.projectManager },
    project.constructionStartDate && { label: "Start", value: project.constructionStartDate },
    project.constructionEndDate && { label: "End", value: project.constructionEndDate },
    weekInfo && { label: "Duration", value: `${weekInfo.totalWeeks} weeks` },
  ].filter(Boolean);

  return (
    <header className="contractor-report-header">
      <div className="contractor-report-header-main">
        <div>
          <div className="contractor-report-eyebrow">Weekly construction report</div>
          <h1>{project.storeCode}{project.shoppingMallName ? ` · ${project.shoppingMallName}` : ""}</h1>
          {project.city && <p>{project.city}</p>}
        </div>
        <div className="contractor-report-continuity" role="status">
          <strong>{lastReport ? "Previous report loaded" : "First report"}</strong>
          <span>{lastReportDate || "No prior report is available"}</span>
        </div>
      </div>

      <MetadataRows
        items={contextItems}
        columns={contextItems.length || 1}
        className="contractor-report-context"
      />

      {weekInfo && (
        <div className="contractor-report-week-progress">
          <div>
            <span>{weekInfo.label}</span>
            <strong>{weekPct}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${weekPct}%` }} />
          </div>
        </div>
      )}

      <div className="contractor-report-history">
        <div>
          <span className={lastReport && daysSinceLast > 14 ? "status-dot is-warn" : "status-dot"} aria-hidden="true" />
          <span>Last submitted report</span>
          <strong>{lastReportDate || "No reports yet"}</strong>
          {daysSinceLast !== null && <span>{daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}</span>}
        </div>
        <span>{projectReportsCount} report{projectReportsCount !== 1 ? "s" : ""} submitted total</span>
      </div>
    </header>
  );
}

export default ReportHeaderCard;
