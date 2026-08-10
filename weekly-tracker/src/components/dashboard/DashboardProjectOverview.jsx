import { useProjectDetailDrawerModel } from '../../hooks/useProjectDetailDrawerModel';
import { formatDate } from '../../utils/reportUtils';
import { getScheduleRiskLabel } from '../../hooks/useScheduleRiskPresentation';
import { SchedBadge } from './DashboardWidgets';
import { RiskBadge } from '../RiskGauge';
import AttentionSurface from '../shared/detail/AttentionSurface.jsx';
import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';
import EmptyState from '../shared/detail/EmptyState.jsx';
import EvidenceLedger from '../shared/detail/EvidenceLedger.jsx';
import MetadataRows from '../shared/detail/MetadataRows.jsx';

function displayValue(value, fallback = 'Not set') {
  return value === null || value === undefined || value === '' ? fallback : value;
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

  const scheduleMetadata = [
    {
      label: 'Schedule status',
      value: contractor.scheduleStatus ? <SchedBadge status={contractor.scheduleStatus} /> : 'Unavailable',
    },
    {
      label: 'Construction window',
      value: project.constructionStartDate || project.constructionEndDate
        ? `${project.constructionStartDate ? formatDate(project.constructionStartDate) : 'Not set'} — ${project.constructionEndDate ? formatDate(project.constructionEndDate) : 'Not set'}`
        : 'Not set',
    },
    {
      label: 'Target opening',
      value: project.targetOpeningDate ? formatDate(project.targetOpeningDate) : 'Not set',
    },
    {
      label: 'Report source',
      value: latestReportDate ? `Contractor report · ${formatDate(latestReportDate)}` : 'No current report',
    },
  ];

  const evidenceItems = [
    {
      label: 'Contractor report',
      value: latestReportDate ? formatDate(latestReportDate) : 'No report',
      secondary: `${projReports?.length ?? 0} reports submitted`,
    },
    {
      label: 'PM site visit',
      value: pmVisit.latestVisitDate ? formatDate(pmVisit.latestVisitDate) : 'No visit',
      secondary: `${siteVisits.length} visits · ${pmVisit.discrepancies ?? 0} discrepancies`,
    },
    {
      label: 'Current-period freshness',
      value: risk.missingReport ? 'Overdue' : 'Current',
      secondary: risk.missingReport ? 'Contractor report' : 'Latest report available',
    },
    {
      label: 'Coverage',
      value: confidenceLabel,
      secondary: `${projReports?.length ?? 0} reports · ${siteVisits.length} visits`,
    },
  ];

  const contextItems = [
    {
      label: 'Project',
      value: [
        project.storeConcept || project.projectType,
        project.storeSizeSqm ? `${project.storeSizeSqm} m²` : null,
      ].filter(Boolean).join(' · ') || 'Not set',
    },
    { label: 'Location', value: displayValue(location) },
    { label: 'Project manager', value: displayValue(project.projectManager) },
    { label: 'General contractor', value: displayValue(project.generalContractor) },
    { label: 'Location type', value: displayValue(project.locationType) },
    { label: 'Sales market', value: displayValue(project.salesMarket) },
  ];

  return (
    <div className="dashboard-project-overview canonical-detail-flow is-spaced">
      <AttentionSurface
        title="Needs Attention"
        accessory={attentionItems.length === 1 ? '1 issue' : `${attentionItems.length} issues`}
        className="dashboard-needs-attention"
      >
        {attentionItems.length > 0 ? (
          <div className="dashboard-needs-attention-list">
            {attentionItems.map(({ key, ...item }) => <AttentionItem key={key} {...item} />)}
          </div>
        ) : (
          <EmptyState title="No current attention items" className="dashboard-attention-empty" />
        )}
      </AttentionSurface>

      <AnalyticalSection title="Operational Status" className="dashboard-operational-status" ruled={false}>
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
      </AnalyticalSection>

      <AnalyticalSection title="Schedule & Progress" className="dashboard-schedule-section">
        <MetadataRows items={scheduleMetadata} columns={4} className="dashboard-detail-grid dashboard-schedule-grid" />
      </AnalyticalSection>

      <AnalyticalSection title="Recent Operational Evidence" className="dashboard-evidence-section">
        <EvidenceLedger items={evidenceItems} layout="grid" columns={4} className="dashboard-evidence-ledger" />
      </AnalyticalSection>

      <AnalyticalSection title="Project Context" className="dashboard-secondary-context">
        <MetadataRows items={contextItems} columns={6} className="dashboard-context-list" />
      </AnalyticalSection>
    </div>
  );
}
