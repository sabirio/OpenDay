import { useState } from "react";
import { formatDate, daysUntil } from "../../utils/reportUtils";
import { getOpeningColor } from "../../config/thresholds";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";
import { describeProjectLocation } from "../../hooks/useProjectInfoPresentation";

// Portfolio v1's frozen primary column set (Project Information Architecture
// v1, §3). Project Manager / Start Date / End Date / Mall / GC Access / Edit
// are no longer primary columns — their data and actions are unchanged and
// remain reachable via Store Code (-> Project Information) and the row's
// "..." menu, not deleted.
function RowActionsMenu({ project, onEditProject, onInviteContractor }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label={`Actions for ${project.storeCode || "project"}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-button"
        style={{ fontSize: 16, lineHeight: 1, padding: "4px 8px" }}
      >
        ⋯
      </button>
      {open && (
        <>
          {/* Backdrop closes the menu on outside click without needing a global listener. */}
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div
            role="menu"
            style={{
              position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 11,
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8,
              boxShadow: "var(--shadow)", minWidth: 160, overflow: "hidden",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEditProject(project); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
            >
              Edit Project
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onInviteContractor(project); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: project.contractorEmail ? "var(--status-done)" : "var(--status-warn)" }}
            >
              {project.contractorEmail ? "GC Invited" : "GC Invite"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectTable({ projects, totalProjects, onViewProject, onEditProject, onInviteContractor }) {
  return (
    <div className="dashboard-summary-card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        {/* minWidth (not width:100%) so narrow viewports scroll this
            container horizontally instead of squeezing 9 fixed-layout
            columns into unreadable overlapping text. */}
        <table className="dashboard-table" style={{ width: "100%", minWidth: 860, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Store Code</th>
              <th style={{ width: 90 }}>Country</th>
              <th style={{ width: 90 }}>City</th>
              <th style={{ width: 100 }}>Location Type</th>
              <th style={{ width: 150 }}>Location</th>
              <th style={{ width: 100 }}>Type</th>
              <th style={{ width: 90 }}>Concept</th>
              <th style={{ width: 100 }}>Target Opening</th>
              <th style={{ width: 80 }}>Status</th>
              <th aria-label="Actions" style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan="10" style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>
                {totalProjects === 0 ? "No projects yet. Click \"Add New Project\" to create one." : "No projects match the current filters."}
              </td></tr>
            ) : (
              projects.map((project) => {
                const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
                const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
                const openingColor = getOpeningColor(daysLeft);
                const location = describeProjectLocation(project);

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
                    <td style={{ color: "var(--text-secondary)" }}>{project.country || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.city || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{location.locationType || "-"}</td>
                    <td style={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{location.value || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.projectType || "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{project.storeConcept || "-"}</td>
                    <td>
                      {openingDate ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: openingColor, whiteSpace: "nowrap" }}>{formatDate(project.targetOpeningDate)}</div>
                          <div style={{ fontSize: 11, color: openingColor }}>
                            {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : `${daysOverdueCount(daysLeft)}d overdue`}
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
                    <td onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu project={project} onEditProject={onEditProject} onInviteContractor={onInviteContractor} />
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
