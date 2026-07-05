import { formatDate } from "../../utils/reportUtils";

export default function MissingReportsModal({ missingRows, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 780, maxWidth: "96vw", maxHeight: "85vh", background: "var(--bg-surface)", zIndex: 1001, borderRadius: 16, boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", borderTop: "3px solid var(--status-alert)", border: "1px solid var(--border)" }}>
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>Missing Reports</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Projects with no report or last report older than 7 days</div>
          </div>
          <button type="button" onClick={onClose} style={{ padding: "5px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--accent-subtle)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close x</button>
        </div>
        <div style={{ overflowY: "auto", padding: "16px 24px" }}>
          <table className="dashboard-table" style={{ width: "100%" }}>
            <thead><tr><th>Project</th><th>Contractor</th><th>Last Report</th><th>Days Since</th><th>PM</th><th>Status</th></tr></thead>
            <tbody>
              {missingRows.map(({ project, latestReport, daysSinceReport }) => (
                <tr key={project.id}>
                  <td><div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{project.storeCode}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{project.shoppingMallName}</div></td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{project.generalContractor || "-"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: "var(--status-alert)", fontWeight: 700 }}>Never</span>}</td>
                  <td style={{ fontSize: 13, fontWeight: 700, color: "var(--status-alert)" }}>{daysSinceReport !== null ? `${daysSinceReport}d` : "-"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{project.projectManager || "-"}</td>
                  <td>{!latestReport ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-alert)", padding: "2px 8px", borderRadius: 7, background: "var(--status-alert-bg)", border: "1px solid var(--border)" }}>Missing</span> : <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-warn)", padding: "2px 8px", borderRadius: 7, background: "var(--status-warn-bg)", border: "1px solid var(--border)" }}>Overdue</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
