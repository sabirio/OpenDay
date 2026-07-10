import { PHASES } from "../../config/masterTaskLibrary";
import { TEMPLATES } from "../../config/projectTemplates";
import { getOpeningColor } from "../../config/thresholds";
import { formatDate, daysUntil } from "../../utils/reportUtils";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";
import { DetailField, FieldRow, FormSection } from "./ProjectFormParts";

const PHASE_MAP = Object.fromEntries(
  PHASES.map(p => [p.id, { ...p, bg: "var(--bg-elevated)", border: "var(--border)" }])
);

export default function ProjectDetailModal({ project, onClose, onEdit }) {
  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const openingColor = getOpeningColor(daysLeft);

  const stakeholders = [
    { label: "Project Manager", value: project.projectManager },
    { label: "General Contractor", value: project.generalContractor },
    { label: "Security Manager", value: project.securityManager },
    { label: "IT Manager", value: project.itManager },
    { label: "Facility Manager", value: project.facilityManager },
    { label: "HR Manager", value: project.hrManager },
    { label: "Supply Manager", value: project.supplyManager },
  ].filter((s) => s.value);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: "95vw" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{project.storeCode || "-"}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>{project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}</div>
            </div>
            <span style={{
              padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700,
              background: project.projectStatus === "Active" ? "var(--status-done-bg)" : "var(--bg-elevated)",
              color: project.projectStatus === "Active" ? "var(--status-done)" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}>{project.projectStatus}</span>
            <span style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--border)" }}>
              {project.projectType}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="small-button" onClick={() => window.open(`/site-visit/${project.id}`, "_blank")} style={{ fontWeight: 600 }}>Site Visit</button>
            <button className="small-button" onClick={onEdit} style={{ fontWeight: 600 }}>Edit Project</button>
            <button className="close-button" onClick={onClose}>x</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 72px)", padding: "20px 24px" }}>
          <FormSection title="Address" accentColor="var(--accent)">
            <FieldRow>
              <DetailField label="Shopping Mall" value={project.shoppingMallName} />
              <DetailField label="Sales Market" value={project.salesMarket} />
              <DetailField label="City" value={project.city} />
              <DetailField label="State / Region" value={project.state} />
              <DetailField label="Street" value={project.street} />
              <DetailField label="Country" value={project.country} />
            </FieldRow>
          </FormSection>

          <FormSection title="Dates" accentColor="var(--status-warn)">
            <FieldRow>
              <DetailField label="Construction Start" value={project.constructionStartDate} />
              <DetailField label="Construction End" value={project.constructionEndDate} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 3 }}>Target Opening</div>
                {openingDate ? (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: openingColor }}>{formatDate(project.targetOpeningDate)}</div>
                    {daysLeft !== null && (
                      <div style={{ fontSize: 11, color: openingColor, marginTop: 2 }}>
                        {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? "Today" : `${daysOverdueCount(daysLeft)} days overdue`}
                      </div>
                    )}
                  </div>
                ) : <div style={{ fontSize: 13, color: "var(--text-muted)" }}>-</div>}
              </div>
            </FieldRow>
          </FormSection>

          {stakeholders.length > 0 && (
            <FormSection title="Stakeholders" accentColor="var(--status-done)">
              <FieldRow>
                {stakeholders.map(({ label, value }) => (
                  <DetailField key={label} label={label} value={value} />
                ))}
              </FieldRow>
            </FormSection>
          )}

          {(project.templateType || (project.phases || []).length > 0) && (
            <FormSection title="Construction Phases" accentColor="var(--status-done)">
              {project.templateType ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>
                    {TEMPLATES.find(t => t.id === project.templateType)?.label || project.templateType}
                  </span>
                  {project.storeSizeSqm && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{project.storeSizeSqm} sqm</span>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(project.phases || []).map((phase) => {
                    const cfg = PHASE_MAP[phase];
                    if (!cfg) return null;
                    return (
                      <span key={phase} style={{
                        padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}`,
                      }}>{cfg.label}</span>
                    );
                  })}
                </div>
              )}
            </FormSection>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginRight: 4 }}>Contractor Link</div>
            <a href={`/contractor-report/${project.id}`} className="contractor-link" style={{ flex: 1, fontSize: 13 }}>
              {window.location.origin}/contractor-report/{project.id}
            </a>
            <button className="small-button" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/contractor-report/${project.id}`);
              alert("Link copied.");
            }}>Copy</button>
          </div>
        </div>
      </div>
    </div>
  );
}
