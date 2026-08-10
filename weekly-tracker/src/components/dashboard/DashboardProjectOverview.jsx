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

function DetailSection({ title, children, className = '' }) {
  return (
    <section className={`dashboard-overview-region ${className}`.trim()}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function AttentionItem({ title, evidence, context }) {
  return (
    <article className="dashboard-needs-attention-item">
      <div className="dashboard-needs-attention-copy">
        <h4>{title}</h4>
        <p><strong>Evidence</strong><span>{evidence}</span></p>
        {context && <p><strong>Context</strong><span>{context}</span></p>}
      </div>
    </article>
  );
}

function StatusItem({ label, value, detail, className = '', children }) {
  return (
    <div className={`dashboard-status-item ${className}`.trim()}>
      <span className="dashboard-status-label">{label}</span>
      <div className="dashboard-status-value">{value}</div>
      {children}
      <span className="dashboard-status-detail">{detail}</span>
    </div>
  );
}

export default function DashboardProjectOverview({ row, siteVisits = [] }) {
  const summary = useProjectDetailDrawerModel(row, siteVisits);
  if (!row || !summary) return null;

  const { project, latestReport, progress, projReports } = row;
  const { contractor, pmVisit, risk, opening } = summary;
  const location = [project.city, project.country].filter(Boolean).join(', ');
  const latestReportDate = latestReport?.reportingDate || latestReport?.submittedAt;
  const scheduleLabel = getScheduleRiskLabel(risk.scheduleRisk);
  const openingLabel = displayValue(opening.statusLabel ?? opening.status, 'Unavailable');
  const confidenceLabel = displayValue(row.confidence?.label, 'Unavailable');
  const hasPmIssue = !pmVisit.hasVisit || pmVisit.discrepancies > 0;
  const attentionItems = [];

  if (risk.missingReport) {
    attentionItems.push({
      key: 'report',
      title: 'Contractor report missing / overdue',
      evidence: [
        'Current contractor report missing',
        project.generalContractor,
      ].filter(Boolean).join(' · '),
      context: `Schedule status ${contractor.scheduleStatus || scheduleLabel || 'Unavailable'}`,
    });
  }

  if (hasPmIssue) {
    attentionItems.push({
      key: 'pm',
      title: !pmVisit.hasVisit ? 'PM verification required' : `${pmVisit.discrepancies} PM discrepancies require review`,
      evidence: !pmVisit.hasVisit
        ? 'No PM site visit available'
        : [
            pmVisit.latestVisitDate ? `PM visit ${formatDate(pmVisit.latestVisitDate)}` : 'Latest PM visit',
            `${pmVisit.discrepancies} discrepancies`,
          ].join(' · '),
      context: risk.supportRequired ? 'Client support required' : null,
    });
  }

  if (risk.blocked) {
    attentionItems.push({
      key: 'blocked',
      title: 'Blocked work requires attention',
      evidence: 'Canonical risk state: Blocked',
      context: risk.supportRequired ? 'Client support required' : null,
    });
  }

  if (!risk.missingReport && risk.scheduleRisk !== 'OK') {
    attentionItems.push({
      key: 'schedule',
      title: `Schedule ${scheduleLabel.toLowerCase()}`,
      evidence: latestReportDate ? `Contractor report ${formatDate(latestReportDate)}` : 'Schedule evidence unavailable',
      context: `Opening readiness ${openingLabel}`,
    });
  }

  if (risk.supportRequired && !hasPmIssue && !risk.blocked) {
    attentionItems.push({
      key: 'support',
      title: 'Client support required',
      evidence: 'Canonical risk state: Support required',
      context: null,
    });
  }

  return (
    <div className="dashboard-project-overview">
      <DetailSection title="Needs Attention" className="dashboard-needs-attention">
        <div className="dashboard-needs-attention-heading">
          <span>{attentionItems.length === 1 ? '1 issue' : `${attentionItems.length} issues`}</span>
        </div>
        {attentionItems.length > 0 ? (
          <div className="dashboard-needs-attention-list">
            {attentionItems.map((item) => <AttentionItem key={item.key} {...item} />)}
          </div>
        ) : (
          <p className="dashboard-attention-empty">No current attention items</p>
        )}
      </DetailSection>

      <DetailSection title="Operational Status" className="dashboard-operational-status">
        <div className="dashboard-status-strip">
          <StatusItem label="Progress" value={`${progress}%`} detail="Canonical overall" className="is-progress">
            <div
              className="dashboard-progress-track"
              role="progressbar"
              aria-label="Canonical overall progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              style={{ '--dashboard-progress': `${progress}%` }}
            >
              <span />
            </div>
          </StatusItem>
          <StatusItem
            label="Schedule"
            value={contractor.scheduleStatus ? <SchedBadge status={contractor.scheduleStatus} /> : 'Unavailable'}
            detail={latestReportDate ? `Report · ${formatDate(latestReportDate)}` : 'No current report'}
          />
          <StatusItem label="Overall risk" value={<RiskBadge level={risk.level} />} detail="Current engine output" />
          <StatusItem label="Opening readiness" value={openingLabel} detail="Current available data" />
          <StatusItem
            label="Evidence coverage"
            value={confidenceLabel}
            detail={risk.missingReport ? 'Current period overdue' : 'Current period available'}
          />
        </div>
      </DetailSection>

      <DetailSection title="Schedule & Progress" className="dashboard-schedule-section">
        <dl className="dashboard-detail-grid dashboard-schedule-grid">
          <DetailField label="Schedule status">
            {contractor.scheduleStatus ? <SchedBadge status={contractor.scheduleStatus} /> : 'Unavailable'}
          </DetailField>
          <DetailField label="Construction window">
            {project.constructionStartDate || project.constructionEndDate
              ? `${project.constructionStartDate ? formatDate(project.constructionStartDate) : 'Not set'} — ${project.constructionEndDate ? formatDate(project.constructionEndDate) : 'Not set'}`
              : 'Not set'}
          </DetailField>
          <DetailField label="Target opening">
            {project.targetOpeningDate ? formatDate(project.targetOpeningDate) : 'Not set'}
          </DetailField>
          <DetailField label="Report source">
            {latestReportDate ? `Contractor report · ${formatDate(latestReportDate)}` : 'No current report'}
          </DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Recent Operational Evidence" className="dashboard-evidence-section">
        <dl className="dashboard-evidence-ledger">
          <DetailField label="Contractor report">
            <strong>{latestReportDate ? formatDate(latestReportDate) : 'No report'}</strong>
            <span>{projReports?.length ?? 0} reports submitted</span>
          </DetailField>
          <DetailField label="PM site visit">
            <strong>{pmVisit.latestVisitDate ? formatDate(pmVisit.latestVisitDate) : 'No visit'}</strong>
            <span>{siteVisits.length} visits · {pmVisit.discrepancies ?? 0} discrepancies</span>
          </DetailField>
          <DetailField label="Current-period freshness">
            <strong>{risk.missingReport ? 'Overdue' : 'Current'}</strong>
            <span>{risk.missingReport ? 'Contractor report' : 'Latest report available'}</span>
          </DetailField>
          <DetailField label="Coverage">
            <strong>{confidenceLabel}</strong>
            <span>{projReports?.length ?? 0} reports · {siteVisits.length} visits</span>
          </DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Project Context" className="dashboard-secondary-context">
        <dl className="dashboard-context-list">
          <DetailField label="Project">
            {[
              project.storeConcept || project.projectType,
              project.storeSizeSqm ? `${project.storeSizeSqm} m²` : null,
            ].filter(Boolean).join(' · ') || 'Not set'}
          </DetailField>
          <DetailField label="Location">{displayValue(location)}</DetailField>
          <DetailField label="Project manager">{displayValue(project.projectManager)}</DetailField>
          <DetailField label="General contractor">{displayValue(project.generalContractor)}</DetailField>
          <DetailField label="Location type">{displayValue(project.locationType)}</DetailField>
          <DetailField label="Sales market">{displayValue(project.salesMarket)}</DetailField>
        </dl>
      </DetailSection>
    </div>
  );
}
