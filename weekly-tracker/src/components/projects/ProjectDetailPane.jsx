import { getOpeningUrgencyColor } from "../../config/statusColors";
import { formatDate, daysUntil } from "../../utils/reportUtils";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";
import { describeProjectLocation } from "../../hooks/useProjectInfoPresentation";
import BenchmarkView from "./BenchmarkView";
import ProjectCurrentSituation from "./ProjectCurrentSituation.jsx";
import StatusBadge from "../shared/StatusBadge.jsx";
import { Link, useLocation } from "react-router-dom";

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
        <StatusBadge tone="neutral">{project.projectStatus || "Status not set"}</StatusBadge>
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
  const routeLocation = useLocation();
  const returnState = { returnTo: `${routeLocation.pathname}${routeLocation.search}` };
  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const daysLeft = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const openingColor = getOpeningUrgencyColor(daysLeft);
  const hasForecast = project.constructionCompletionDate || project.forecastOpeningDate;

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
        <ProjectDetailSection title="Commercial controls" description="Approved budget, payments, forecasts and final project closeout.">
          <div className="project-detail-link-actions">
            <Link className="btn btn-primary" to={`/projects/${project.id}/cost-packages`} state={returnState}>Procurement Strategy</Link>
            <Link className="btn btn-secondary" to={`/projects/${project.id}/budget`} state={returnState}>Open departmental budget</Link>
            <Link className="btn btn-secondary" to={`/projects/${project.id}/payments`} state={returnState}>Payment Schedule</Link>
            <Link className="btn btn-secondary" to={`/projects/${project.id}/closeout`} state={returnState}>Project Closeout</Link>
          </div>
        </ProjectDetailSection>
        <ProjectDetailSection title="Commercial source of truth" description="Excel is available for offline compatibility, while the OpenDay BOQ remains authoritative.">
          <ProjectDetailGrid>
            <ProjectDetailValue label="Currency" value={project.currencyCode} />
          </ProjectDetailGrid>
          <div className="project-detail-link-actions">
            <Link className="btn btn-secondary" to={`/projects/${project.id}/budget`} state={returnState}>Approved Budget Baseline</Link>
            <Link className="btn btn-secondary" to={`/projects/${project.id}/cost-forecast`} state={returnState}>Cost Packages and Forecast</Link>
          </div>
        </ProjectDetailSection>
      </div>
    );
  }

  if (activeTab === "additional-works") {
    return (
      <div className="project-detail-sheet">
        <ProjectDetailSection title="Additional Works / Variations" description="Register, review and approve changes outside the original project scope.">
          <div className="project-detail-link-actions">
            <Link className="btn btn-primary" to={`/projects/${project.id}/variations`} state={returnState}>Open Additional Works / Variations</Link>
          </div>
        </ProjectDetailSection>
      </div>
    );
  }

  if (activeTab === "team") {
    return (
      <div className="project-detail-sheet">
        <ProjectDetailSection title="Responsible parties" description="People and companies already assigned to the project.">
          <div className="project-detail-link-actions">
            <Link className="btn btn-primary" to={`/projects/${project.id}/project-team`} state={returnState}>Manage Project Team</Link>
          </div>
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

  if (activeTab === "tender") {
    return (
      <div className="project-detail-sheet">
        <ProjectDetailSection title="Tender" description="State-driven tender workspace for participants, BOQ, bid rounds, comparison, clarifications and award.">
          <div className="project-detail-link-actions">
            <Link className="btn btn-primary" to={`/projects/${project.id}/tender`} state={returnState}>Open Tender workspace</Link>
            <Link className="btn btn-secondary" to={`/projects/${project.id}/boq`} state={returnState}>Open BOQ editor</Link>
            <Link className="btn btn-secondary" to={`/projects/${project.id}/tender-packages`} state={returnState}>Manage Tender Packages</Link>
          </div>
        </ProjectDetailSection>
      </div>
    );
  }

  return <ProjectCurrentSituation project={project} daysLeft={daysLeft} returnState={returnState} />;
}
