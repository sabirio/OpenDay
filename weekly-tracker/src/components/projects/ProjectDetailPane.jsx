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
import { useToast } from "../shared/Toast.jsx";

const PHASE_MAP = Object.fromEntries(
  PHASES.map(p => [p.id, { ...p, bg: "var(--bg-elevated)", border: "var(--border)" }])
);

const DETAIL_TABS = [
  { id: "information", label: "Information" },
  { id: "benchmark", label: "Benchmark" },
];

/**
 * Selected-project presentation — header (identity/status/actions) + the
 * Information/Benchmark tabs + tab content. No modal chrome: this is the
 * inline content of the Portfolio master-detail Details pane. Same
 * canonical fields/formatters/Benchmark integration as the prior
 * ProjectDetailModal (Project Information Architecture semantics unchanged,
 * only the container around this content changed).
 */
export default function ProjectDetailPane({ project, projects, onEdit, onBack }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("information");
  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const openingColor = getOpeningColor(daysLeft);
  const location = describeProjectLocation(project);
  const hasForecast = project.constructionCompletionDate || project.forecastOpeningDate;
  const hasActuals = project.actualConstructionStartDate || project.actualConstructionCompletionDate || project.actualOpeningDate;

  const parties = [
    { label: "General Contractor", value: project.generalContractor },
    { label: "Contractor Email", value: project.contractorEmail },
    { label: "Project Manager", value: project.projectManager },
    { label: "Security Manager", value: project.securityManager },
    { label: "IT Manager", value: project.itManager },
    { label: "Facility Manager", value: project.facilityManager },
    { label: "HR Manager", value: project.hrManager },
    { label: "Supply Manager", value: project.supplyManager },
  ].filter((s) => s.value);

  return (
    <div className="portfolio-details-content">
      <div className="portfolio-details-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap", rowGap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div id="project-detail-title" style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>{project.storeCode || "-"}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{location.value}{project.city ? ` · ${project.city}` : ""}</div>
          </div>
          <span style={{
            padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0,
            background: project.projectStatus === "Active" ? "var(--status-done-bg)" : "var(--bg-elevated)",
            color: project.projectStatus === "Active" ? "var(--status-done)" : "var(--text-muted)",
            border: "1px solid var(--border)",
          }}>{project.projectStatus}</span>
          <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0, background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid var(--border)" }}>
            {project.projectType}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button className="text-button portfolio-back-to-list" type="button" onClick={onBack}>← Back to Projects</button>
          <button className="btn btn-secondary" onClick={() => window.open(`/site-visit/${project.id}`, "_blank")}>Site Visit</button>
          <button className="btn btn-secondary" onClick={onEdit}>Edit Project</button>
        </div>
      </div>

      <div style={{ padding: "0 24px", flexShrink: 0 }}>
        <ProjectDetailTabs tabs={DETAIL_TABS} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="portfolio-details-body">
        {activeTab === "benchmark" ? (
          <BenchmarkView project={project} projects={projects || []} />
        ) : (
          <>
            <FormSection title="General" accentColor="var(--accent)">
              <FieldRow>
                <DetailField label="Store Code" value={project.storeCode} />
                <DetailField label="Country" value={project.country} />
                <DetailField label="City" value={project.city} />
                <DetailField label="Location Type" value={location.locationType} />
                <DetailField label={location.fieldLabel || "Location"} value={location.value} />
                <DetailField label="Sales Market" value={project.salesMarket} />
                <DetailField label="State / Region" value={project.state} />
                <DetailField label="Project Type" value={project.projectType} />
                <DetailField label="Store Concept" value={project.storeConcept} />
                <DetailField label="Total Area" value={formatArea(project.storeSizeSqm)} />
                <DetailField label="Sales Area" value={formatArea(project.salesAreaSqm)} />
                <DetailField label="Back of House Area" value={formatArea(project.backOfHouseAreaSqm)} />
              </FieldRow>
            </FormSection>

            <FormSection title="Schedule" accentColor="var(--status-warn)">
              <FieldRow>
                <DetailField label="Planned Construction Start" value={project.constructionStartDate} />
                <DetailField label="Planned Construction End" value={project.constructionEndDate} />
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 3 }}>Target Opening</div>
                  {openingDate ? (
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: openingColor }}>{formatDate(project.targetOpeningDate)}</div>
                      {daysLeft !== null && (
                        <div style={{ fontSize: 10.5, color: openingColor, marginTop: 2 }}>
                          {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? "Today" : `${daysOverdueCount(daysLeft)} days overdue`}
                        </div>
                      )}
                    </div>
                  ) : <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>-</div>}
                </div>
                {hasActuals && <DetailField label="Actual Construction Start" value={project.actualConstructionStartDate} />}
                {hasActuals && <DetailField label="Actual Construction Completion" value={project.actualConstructionCompletionDate} />}
                {hasActuals && <DetailField label="Actual Opening" value={project.actualOpeningDate} />}
              </FieldRow>
              {hasForecast && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>Forecast (engine-calculated, read only)</div>
                  <FieldRow>
                    <DetailField label="Construction Completion" value={project.constructionCompletionDate} />
                    <DetailField label="Opening" value={project.forecastOpeningDate} />
                  </FieldRow>
                </div>
              )}
            </FormSection>

            <FormSection title="Financial" accentColor="var(--status-warn)">
              <FieldRow>
                <DetailField label="Budget" value={formatMoney(project.budget, project.currencyCode)} />
                <DetailField label="Actual Cost" value={formatMoney(project.actualCost, project.currencyCode)} />
                <DetailField label="Currency" value={project.currencyCode} />
              </FieldRow>
            </FormSection>

            {parties.length > 0 && (
              <FormSection title="Parties" accentColor="var(--status-done)">
                <FieldRow>
                  {parties.map(({ label, value }) => (
                    <DetailField key={label} label={label} value={value} />
                  ))}
                </FieldRow>
              </FormSection>
            )}

            {(project.templateType || (project.phases || []).length > 0) && (
              <FormSection title="Construction Phases" accentColor="var(--status-done)">
                {project.templateType ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 600 }}>
                      {TEMPLATES.find(t => t.id === project.templateType)?.label || project.templateType}
                    </span>
                    {project.storeSizeSqm && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{project.storeSizeSqm} sqm</span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(project.phases || []).map((phase) => {
                      const cfg = PHASE_MAP[phase];
                      if (!cfg) return null;
                      return (
                        <span key={phase} style={{
                          padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                        }}>{cfg.label}</span>
                      );
                    })}
                  </div>
                )}
              </FormSection>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginRight: 4 }}>Contractor Link</div>
              <a href={`/contractor-report/${project.id}`} className="contractor-link" style={{ flex: 1, fontSize: 12.5 }}>
                {window.location.origin}/contractor-report/{project.id}
              </a>
              <button className="btn btn-secondary" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/contractor-report/${project.id}`);
                toast.success("Link copied.", { duration: 2500 });
              }}>Copy</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
