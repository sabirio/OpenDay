import { useState } from "react";
import { PHASES } from "../../config/masterTaskLibrary";
import { TEMPLATES } from "../../config/projectTemplates";
import { getOpeningColor } from "../../config/thresholds";
import { formatDate, daysUntil } from "../../utils/reportUtils";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";
import { describeProjectLocation, formatArea, formatMoney } from "../../hooks/useProjectInfoPresentation";
import { DetailField, FieldRow, FormSection } from "./ProjectFormParts";
import ProjectDetailTabs from "./ProjectDetailTabs";
import BenchmarkView from "./BenchmarkView";
import Modal from "../shared/Modal";
import { useToast } from "../shared/Toast.jsx";

const PHASE_MAP = Object.fromEntries(
  PHASES.map(p => [p.id, { ...p, bg: "var(--bg-elevated)", border: "var(--border)" }])
);

const DETAIL_TABS = [
  { id: "information", label: "Information" },
  { id: "benchmark", label: "Benchmark" },
];

export default function ProjectDetailModal({ project, projects, onClose, onEdit }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("information");
  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const openingColor = getOpeningColor(daysLeft);
  const location = describeProjectLocation(project);
  const hasForecast = project.constructionCompletionDate || project.forecastOpeningDate;

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
    <Modal onClose={onClose} titleId="project-detail-title" style={{ maxWidth: 720, width: "95vw" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div id="project-detail-title" style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{project.storeCode || "-"}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>{location.value}{project.city ? ` · ${project.city}` : ""}</div>
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

        <div style={{ padding: "0 24px" }}>
          <ProjectDetailTabs tabs={DETAIL_TABS} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "benchmark" ? (
          <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 116px)", padding: "20px 24px" }}>
            <BenchmarkView project={project} projects={projects || []} />
          </div>
        ) : (
        <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 116px)", padding: "20px 24px" }}>
          <FormSection title="Identity & Location" accentColor="var(--accent)">
            <FieldRow>
              <DetailField label="Country" value={project.country} />
              <DetailField label="City" value={project.city} />
              <DetailField label="Location Type" value={location.locationType} />
              <DetailField label={location.fieldLabel || "Location"} value={location.value} />
              <DetailField label="Sales Market" value={project.salesMarket} />
              <DetailField label="State / Region" value={project.state} />
            </FieldRow>
          </FormSection>

          <FormSection title="Classification" accentColor="var(--accent)">
            <FieldRow>
              <DetailField label="Project Type" value={project.projectType} />
              <DetailField label="Store Concept" value={project.storeConcept} />
            </FieldRow>
          </FormSection>

          <FormSection title="Areas" accentColor="var(--accent)">
            <FieldRow>
              <DetailField label="Total Area" value={formatArea(project.storeSizeSqm)} />
              <DetailField label="Sales Area" value={formatArea(project.salesAreaSqm)} />
              <DetailField label="Back of House Area" value={formatArea(project.backOfHouseAreaSqm)} />
            </FieldRow>
          </FormSection>

          <FormSection title="Planned Dates" accentColor="var(--status-warn)">
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

          {(project.actualConstructionStartDate || project.actualConstructionCompletionDate || project.actualOpeningDate) && (
            <FormSection title="Actual Dates" accentColor="var(--status-done)">
              <FieldRow>
                <DetailField label="Construction Start" value={project.actualConstructionStartDate} />
                <DetailField label="Construction Completion" value={project.actualConstructionCompletionDate} />
                <DetailField label="Opening" value={project.actualOpeningDate} />
              </FieldRow>
            </FormSection>
          )}

          {hasForecast && (
            <FormSection title="Forecast Dates (engine-calculated, read only)" accentColor="var(--text-muted)">
              <FieldRow>
                <DetailField label="Construction Completion" value={project.constructionCompletionDate} />
                <DetailField label="Opening" value={project.forecastOpeningDate} />
              </FieldRow>
            </FormSection>
          )}

          <FormSection title="Financial" accentColor="var(--status-warn)">
            <FieldRow>
              <DetailField label="Budget" value={formatMoney(project.budget, project.currencyCode)} />
              <DetailField label="Actual Cost" value={formatMoney(project.actualCost, project.currencyCode)} />
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
              toast.success("Link copied.", { duration: 2500 });
            }}>Copy</button>
          </div>
        </div>
        )}
    </Modal>
  );
}
