import { getOpeningColor } from "../../config/thresholds";
import { formatDate, daysUntil } from "../../utils/reportUtils";

export default function ProjectTable({ projects, totalProjects, onViewProject, onEditProject, onInviteContractor }) {
  return (
    <div className="dashboard-summary-card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="dashboard-table" style={{ width: "100%", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th>Store Code</th>
              <th>Mall</th>
              <th>City</th>
              <th>Country</th>
              <th>Project Manager</th>
              <th>Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Target Opening</th>
              <th>Status</th>
              <th>Edit</th>
              <th>GC Access</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan="12" style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>
                {totalProjects === 0 ? "No projects yet. Click \"Add New Project\" to create one." : "No projects match the current filters."}
              </td></tr>
            ) : (
              projects.map((project) => {
                const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
                const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
                const openingColor = getOpeningColor(daysLeft);

                return (
                  <tr key={project.id} style={{ cursor: "pointer", transition: "background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--accent-subtle)"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >
                    <td style={{ overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <div style={{ width: 3, height: 18, borderRadius: 2, background: "var(--accent)", flexShrink: 0 }} />
                        <button
                          onClick={() => onViewProject(project)}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: "var(--text-primary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {project.storeCode || "-"}
                        </button>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.shoppingMallName || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.city || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.country || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.projectManager || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.projectType}</td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDate(project.constructionStartDate)}</td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDate(project.constructionEndDate)}</td>
                    <td>
                      {openingDate ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: openingColor, whiteSpace: "nowrap" }}>{formatDate(project.targetOpeningDate)}</div>
                          <div style={{ fontSize: 11, color: openingColor }}>
                            {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)}d overdue`}
                          </div>
                        </div>
                      ) : <span style={{ color: "var(--text-muted)" }}>-</span>}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: project.projectStatus === "Active" ? "var(--status-done-bg)" : "var(--bg-elevated)",
                        color: project.projectStatus === "Active" ? "var(--status-done)" : "var(--text-muted)",
                        border: "1px solid var(--border)",
                      }}>{project.projectStatus}</span>
                    </td>
                    <td>
                      <button className="text-button" onClick={e => { e.stopPropagation(); onEditProject(project); }}>Edit</button>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={e => { e.stopPropagation(); onInviteContractor(project); }}
                        style={{ color: project.contractorEmail ? "var(--status-done)" : "var(--status-warn)" }}
                      >
                        {project.contractorEmail ? "GC Invited" : "GC Invite"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
