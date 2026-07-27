import { useProjectDetailDrawerModel } from '../../hooks/useProjectDetailDrawerModel';
import { formatDate } from '../../utils/reportUtils';
import { getScheduleRiskLabel } from '../../hooks/useScheduleRiskPresentation';
import { SchedBadge } from './DashboardWidgets';
import { RiskBadge } from '../RiskGauge';

function displayValue(value, fallback = 'Not set') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function DetailField({ label, children }) {
  return (
    <div className="dashboard-detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="dashboard-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function DashboardProjectOverview({ row, siteVisits }) {
  const summary = useProjectDetailDrawerModel(row, siteVisits);
  if (!row || !summary) return null;

  const { project, latestReport, progress, projReports } = row;
  const { contractor, pmVisit, risk, opening } = summary;
  const location = [project.city, project.country].filter(Boolean).join(', ');
  const latestReportDate = latestReport?.reportingDate || latestReport?.submittedAt;

  return (
    <div className="dashboard-project-overview">
      <DetailSection title="Project Information">
        <dl className="dashboard-detail-grid">
          <DetailField label="Store code">{displayValue(project.storeCode)}</DetailField>
          <DetailField label="Project">{displayValue(project.shoppingMallName)}</DetailField>
          <DetailField label="Location">{displayValue(location)}</DetailField>
          <DetailField label="Project type">{displayValue(project.projectType)}</DetailField>
          <DetailField label="Project manager">{displayValue(project.projectManager)}</DetailField>
          <DetailField label="General contractor">{displayValue(project.generalContractor)}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Schedule & Progress">
        <dl className="dashboard-detail-grid">
          <DetailField label="Canonical progress"><strong>{progress}%</strong></DetailField>
          <DetailField label="Schedule status">
            {contractor.scheduleStatus ? <SchedBadge status={contractor.scheduleStatus} /> : 'Unavailable'}
          </DetailField>
          <DetailField label="Construction start">
            {project.constructionStartDate ? formatDate(project.constructionStartDate) : 'Not set'}
          </DetailField>
          <DetailField label="Construction end">
            {project.constructionEndDate ? formatDate(project.constructionEndDate) : 'Not set'}
          </DetailField>
          <DetailField label="Target opening">
            {project.targetOpeningDate ? formatDate(project.targetOpeningDate) : 'Not set'}
          </DetailField>
          <DetailField label="Opening readiness">{displayValue(opening.status, 'Unavailable')}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Project Context">
        <dl className="dashboard-detail-grid">
          <DetailField label="Concept">{displayValue(project.storeConcept)}</DetailField>
          <DetailField label="Location type">{displayValue(project.locationType)}</DetailField>
          <DetailField label="Sales market">{displayValue(project.salesMarket)}</DetailField>
          <DetailField label="Area">
            {project.storeSizeSqm ? `${project.storeSizeSqm} m²` : 'Not set'}
          </DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Latest Risks">
        <dl className="dashboard-detail-grid">
          <DetailField label="Overall risk"><RiskBadge level={risk.level} /></DetailField>
          <DetailField label="Schedule risk">{getScheduleRiskLabel(risk.scheduleRisk)}</DetailField>
          <DetailField label="Reporting">{risk.missingReport ? 'Missing / overdue' : 'Up to date'}</DetailField>
          <DetailField label="Blocked">{risk.blocked ? 'Yes' : 'No'}</DetailField>
          <DetailField label="PM comparison">
            {!pmVisit.hasVisit ? 'No site visit' : pmVisit.discrepancies > 0 ? `${pmVisit.discrepancies} discrepancies` : 'Matched'}
          </DetailField>
          <DetailField label="Client support">{risk.supportRequired ? 'Required' : 'None'}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Recent Reports">
        <dl className="dashboard-detail-grid">
          <DetailField label="Latest report">
            {latestReportDate ? formatDate(latestReportDate) : 'No report'}
          </DetailField>
          <DetailField label="Reports submitted">{projReports?.length ?? 0}</DetailField>
          <DetailField label="Site visits">{siteVisits.length}</DetailField>
          <DetailField label="Data confidence">{displayValue(row.confidence?.label, 'Unavailable')}</DetailField>
        </dl>
      </DetailSection>
    </div>
  );
}
