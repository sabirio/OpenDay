import { PHASES } from "../../config/masterTaskLibrary";
import { TEMPLATES } from "../../config/projectTemplates";
import { getOpeningColor } from "../../config/thresholds";
import { formatDate, daysUntil } from "../../utils/reportUtils";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";
import { describeProjectLocation, formatArea, formatMoney } from "../../hooks/useProjectInfoPresentation";
import BenchmarkView from "./BenchmarkView";
import { useToast } from "../shared/Toast.jsx";

const PHASE_LABELS = Object.fromEntries(PHASES.map((phase) => [phase.id, phase.label]));

function configured(value) {
  return value === null || value === undefined || value === "" ? "Not set" : value;
}

function ProjectDetailSection({ title, description, children }) {
  return (
    <section className="project-detail-section">
      <div className="project-detail-section-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ProjectDetailGrid({ children }) {
  return <dl className="project-detail-kv-grid">{children}</dl>;
}

function ProjectDetailValue({ label, value, emptyLabel = "Not set" }) {
  const displayValue = value === null || value === undefined || value === "" ? emptyLabel : value;
  return (
    <div className="project-detail-kv-row">
      <dt>{label}</dt>
      <dd className={displayValue === emptyLabel ? "is-empty" : undefined}>{displayValue}</dd>
    </div>
  );
}

export function ProjectDetailHeader({ project, onEdit, onBack, onInvite }) {
  const location = describeProjectLocation(project);
  const name = project.shoppingMallName || project.street || location.value;
  const title = [project.storeCode, name].filter(Boolean).join(" — ") || "Project";
  const meta = [
    [project.city, project.country].filter(Boolean).join(", "),
    project.storeConcept,
    project.projectType,
  ].filter(Boolean).join(" · ");

  return (
    <header className="detail-pane-header portfolio-detail-header">
      <button
        type="button"
        className="btn-icon portfolio-back-to-master"
        onClick={onBack}
        aria-label="Back to projects"
      >
        ←
      </button>
      <div className="dashboard-detail-identity">
        <div>
          <div id="project-detail-title" className="dashboard-detail-title" title={title}>{title}</div>
          <div className="dashboard-detail-meta" title={meta}>{meta || "Project metadata not set"}</div>
        </div>
        <span className="dashboard-lifecycle-badge">{project.projectStatus || "Status not set"}</span>
      </div>
      <div className="portfolio-detail-actions">
        <a className="btn btn-secondary" href={`/site-visit/${project.id}`} target="_blank" rel="noreferrer">Site Visit</a>
        <button type="button" className="btn btn-secondary" onClick={onInvite}>Invite GC</button>
        <button type="button" className="btn btn-primary" onClick={onEdit}>Edit Project</button>
      </div>
    </header>
  );
}

export default function ProjectDetailPane({ project, projects, activeTab }) {
  const toast = useToast();
  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const openingColor = getOpeningColor(daysLeft);
  const location = describeProjectLocation(project);
  const hasForecast = project.constructionCompletionDate || project.forecastOpeningDate;
  const template = TEMPLATES.find((item) => item.id === project.templateType)?.label || project.templateType;
  const phases = (project.phases || []).map((phase) => PHASE_LABELS[phase] || phase).join(", ");

  if (activeTab === "benchmark") {
    return <BenchmarkView project={project} projects={projects || []} />;
  }

  if (activeTab === "schedule") {
    return (
      <div className="project-detail-sheet">
        <ProjectDetailSection title="Planned dates" description="Approved project schedule inputs.">
          <ProjectDetailGrid>
            <ProjectDetailValue label="Construction start" value={project.constructionStartDate} />
            <ProjectDetailValue label="Construction end" value={project.constructionEndDate} />
            <div className="project-detail-kv-row">
              <dt>Target opening</dt>
              <dd className={!openingDate ? "is-empty" : undefined}>
                {openingDate ? (
                  <>
                    <strong style={{ color: openingColor }}>{formatDate(project.targetOpeningDate)}</strong>
                    {daysLeft !== null && (
                      <span className="project-detail-value-note" style={{ color: openingColor }}>
                        {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? "Today" : `${daysOverdueCount(daysLeft)} days overdue`}
                      </span>
                    )}
                  </>
                ) : "Not set"}
              </dd>
            </div>
          </ProjectDetailGrid>
        </ProjectDetailSection>
        <ProjectDetailSection title="Actual dates" description="Observed milestones recorded for this project.">
          <ProjectDetailGrid>
            <ProjectDetailValue label="Construction start" value={project.actualConstructionStartDate} emptyLabel="Not recorded" />
            <ProjectDetailValue label="Construction completion" value={project.actualConstructionCompletionDate} emptyLabel="Not recorded" />
            <ProjectDetailValue label="Opening" value={project.actualOpeningDate} emptyLabel="Not recorded" />
          </ProjectDetailGrid>
        </ProjectDetailSection>
        {hasForecast && (
          <ProjectDetailSection title="Forecast" description="Engine-calculated, read-only dates.">
            <ProjectDetailGrid>
              <ProjectDetailValue label="Construction completion" value={project.constructionCompletionDate} emptyLabel="Unavailable" />
              <ProjectDetailValue label="Opening" value={project.forecastOpeningDate} emptyLabel="Unavailable" />
            </ProjectDetailGrid>
          </ProjectDetailSection>
        )}
      </div>
    );
  }

  if (activeTab === "commercial") {
    return (
      <div className="project-detail-sheet">
        <ProjectDetailSection title="Commercial data" description="Configured project cost inputs; no derived calculations are added here.">
          <ProjectDetailGrid>
            <ProjectDetailValue label="Budget" value={project.budget ? formatMoney(project.budget, project.currencyCode) : null} />
            <ProjectDetailValue label="Actual cost" value={project.actualCost ? formatMoney(project.actualCost, project.currencyCode) : null} />
            <ProjectDetailValue label="Currency" value={project.currencyCode} />
          </ProjectDetailGrid>
        </ProjectDetailSection>
      </div>
    );
  }

  if (activeTab === "team") {
    return (
      <div className="project-detail-sheet">
        <ProjectDetailSection title="Responsible parties" description="People and companies already assigned to the project.">
          <ProjectDetailGrid>
            <ProjectDetailValue label="Project Manager" value={project.projectManager} />
            <ProjectDetailValue label="General Contractor" value={project.generalContractor} />
            <ProjectDetailValue label="Contractor email" value={project.contractorEmail} />
            <ProjectDetailValue label="Security Manager" value={project.securityManager} />
            <ProjectDetailValue label="IT Manager" value={project.itManager} />
            <ProjectDetailValue label="Facility Manager" value={project.facilityManager} />
            <ProjectDetailValue label="HR Manager" value={project.hrManager} />
            <ProjectDetailValue label="Supply Manager" value={project.supplyManager} />
          </ProjectDetailGrid>
        </ProjectDetailSection>
      </div>
    );
  }

  return (
    <div className="project-detail-sheet">
      <ProjectDetailSection title="Project profile" description="Core location and retail master data.">
        <ProjectDetailGrid>
          <ProjectDetailValue label="Sales market" value={project.salesMarket} />
          <ProjectDetailValue label="Location type" value={location.locationType} />
          <ProjectDetailValue label={location.fieldLabel || "Location"} value={location.value} />
          <ProjectDetailValue label="State / Region" value={project.state} />
          <ProjectDetailValue label="Store concept" value={project.storeConcept} />
          <ProjectDetailValue label="Project type" value={project.projectType} />
        </ProjectDetailGrid>
      </ProjectDetailSection>
      <ProjectDetailSection title="Areas and construction setup">
        <ProjectDetailGrid>
          <ProjectDetailValue label="Total area" value={project.storeSizeSqm ? formatArea(project.storeSizeSqm) : null} />
          <ProjectDetailValue label="Sales area" value={project.salesAreaSqm ? formatArea(project.salesAreaSqm) : null} />
          <ProjectDetailValue label="Back of house area" value={project.backOfHouseAreaSqm ? formatArea(project.backOfHouseAreaSqm) : null} />
          <ProjectDetailValue label="Construction template" value={configured(template)} />
          <ProjectDetailValue label="Configured phases" value={phases} />
        </ProjectDetailGrid>
      </ProjectDetailSection>
      <ProjectDetailSection title="Contractor access" description="Use compact actions instead of exposing the full report URL.">
        <div className="project-detail-link-actions">
          <a className="btn btn-secondary" href={`/contractor-report/${project.id}`} target="_blank" rel="noreferrer">Open contractor report</a>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/contractor-report/${project.id}`)
                .then(() => toast.success("Link copied.", { duration: 2500 }))
                .catch(() => toast.error("Could not copy the link."));
            }}
          >
            Copy link
          </button>
        </div>
      </ProjectDetailSection>
    </div>
  );
}
