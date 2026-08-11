import { formatDate } from '../../utils/reportUtils';
import {
  formatSignedRiskPoints,
  isHighOrCriticalLevel,
  MAX_RISK_SCORE,
} from '../../hooks/useRiskLevelPresentation';
import StatusBadge from '../shared/StatusBadge.jsx';
import { riskLevelToTone } from '../../config/statusColors';
import AttentionSurface from '../shared/detail/AttentionSurface.jsx';
import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';
import EmptyState from '../shared/detail/EmptyState.jsx';
import EvidenceLedger from '../shared/detail/EvidenceLedger.jsx';
import MetadataRows from '../shared/detail/MetadataRows.jsx';

const RISK_SOURCE_LABELS = {
  blocker: 'Contractor report blockers',
  contractor: 'PM / contractor comparison',
  progress: 'Canonical progress engine',
  risk: 'Contractor report risk evidence',
  schedule: 'Canonical schedule engine',
  support: 'Contractor support request',
};

function sourceLabel(source) {
  return RISK_SOURCE_LABELS[source] || 'Canonical risk engine';
}

function reasonForFactor(row, factor) {
  return row.riskScore.reasons?.find((reason) => reason.text?.startsWith(`${factor.name}:`));
}

export function RiskSelectedOverview({ row }) {
  const reportDate = row.latestReport?.reportingDate || row.latestReport?.submittedAt;
  const latestVisit = [...(row.projSiteVisits || [])].sort(
    (a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt),
  )[0];
  const visitDate = latestVisit?.visitDate || latestVisit?.submittedAt;
  const positiveFactors = row.riskScore.factors
    .filter((factor) => factor.pts > 0)
    .sort((a, b) => b.pts - a.pts);
  const primaryFactor = positiveFactors[0];
  const primaryReason = primaryFactor ? reasonForFactor(row, primaryFactor) : row.riskScore.reasons?.[0];
  const privilegedRisk = isHighOrCriticalLevel(row.riskScore.level);
  const nextAction = row.actions?.[0];
  const operationalItems = [
    {
      label: 'Schedule impact',
      value: row.schedDev?.predictedDelayDays > 0 ? `+${row.schedDev.predictedDelayDays} days` : 'On track',
      secondary: row.schedDev ? 'Current schedule output' : 'Schedule unavailable',
    },
    {
      label: 'Opening readiness',
      value: row.readiness?.status || 'Unavailable',
      secondary: row.readiness?.verdict || 'No readiness verdict',
    },
    {
      label: 'Project progress',
      value: `${row.progress}%`,
      secondary: row.health?.label || 'Current project state',
    },
    {
      label: 'Evidence confidence',
      value: row.confidence?.label || row.confidence?.level || 'Unavailable',
      secondary: row.confidence?.reason || 'Current evidence set',
    },
  ];

  const evidenceItems = [
    {
      label: 'Contractor report',
      value: reportDate ? formatDate(reportDate) : 'Not available',
      secondary: row.latestReport
        ? `${row.latestReport.projectScheduleStatus || 'Schedule not stated'} · ${row.latestReport.activitiesBlocked === 'Yes' ? 'blockers reported' : 'no blocker declared'}`
        : 'No submitted contractor report',
    },
    {
      label: 'PM site visit',
      value: visitDate ? formatDate(visitDate) : 'Not available',
      secondary: `${row.projSiteVisits?.length ?? 0} recorded visit${row.projSiteVisits?.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Risk engine output',
      value: `${row.riskScore.score} / ${MAX_RISK_SCORE}`,
      secondary: `${row.riskScore.reasons?.length ?? 0} exposed reason${row.riskScore.reasons?.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Readiness engine',
      value: row.readiness?.status || 'Unavailable',
      secondary: row.readiness?.verdict || 'No readiness verdict',
    },
  ];

  const contextItems = [
    { label: 'Contractor', value: row.project.generalContractor || 'Contractor unavailable' },
    { label: 'Progress', value: `${row.progress}% progress` },
    { label: 'Health', value: row.health?.label || `Health ${row.health?.score ?? '—'}` },
    { label: 'Contractor performance', value: `${row.contScore?.performanceScore ?? '—'} contractor performance` },
    { label: 'PM alignment', value: `${row.contScore?.pmAlignmentScore ?? '—'} PM alignment` },
  ];

  return (
    <div className="risk-selected-overview canonical-detail-flow">
      <AttentionSurface
        title="Current risk conclusion"
        id="risk-current-heading"
        className="risk-attention-surface"
        tone={privilegedRisk ? 'attention' : 'calm'}
        accessory={(
          <StatusBadge tone={riskLevelToTone(row.riskScore.level)}>
            {row.riskScore.level} · score {row.riskScore.score}
          </StatusBadge>
        )}
      >
        {primaryFactor ? (
          <div className="risk-conclusion-copy">
            <strong>{primaryFactor.name}: {primaryFactor.value}</strong>
            <span>{sourceLabel(primaryReason?.source)} · {formatSignedRiskPoints(primaryFactor.pts)} points</span>
          </div>
        ) : (
          <div className="risk-conclusion-copy">
            <strong>{primaryReason?.text || 'No current positive risk signal'}</strong>
            <span>{sourceLabel(primaryReason?.source)} · no privileged attention state</span>
          </div>
        )}
      </AttentionSurface>

      <AnalyticalSection title="Why this state" className="risk-detail-section risk-why-section">
        {positiveFactors.length > 0 ? (
          <ul className="risk-explanation-list">
            {positiveFactors.slice(0, 3).map((factor) => {
              const reason = reasonForFactor(row, factor);
              return (
                <li key={factor.name}>
                  <strong>{factor.name}</strong>
                  <span>{factor.value}</span>
                  <small>{sourceLabel(reason?.source)} · {formatSignedRiskPoints(factor.pts)} points</small>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No positive risk factors" description="The canonical engine exposes no positive factor for this project." />
        )}
      </AnalyticalSection>

      <AnalyticalSection title="Operational impact" className="risk-detail-section risk-impact-section">
        <MetadataRows items={operationalItems} columns={4} className="risk-operational-strip" />
      </AnalyticalSection>

      <AnalyticalSection title="Response boundary" className="risk-detail-section risk-response-section">
        {nextAction ? (
          <div className="risk-next-action">
            <small>Existing engine recommendation</small>
            <strong>{nextAction.action}</strong>
            <span>{nextAction.reason}</span>
            <p>Continue in the existing project workflow. Risk does not create an Action or Snag here.</p>
          </div>
        ) : (
          <EmptyState title="No engine recommendation" description="Review the existing Project, Weekly Reports, or Site Visit workflow; no task is created here." />
        )}
      </AnalyticalSection>

      <AnalyticalSection title="Evidence provenance" className="risk-detail-section risk-evidence-section">
        <EvidenceLedger
          items={evidenceItems}
          layout="grid"
          columns={4}
          contained
          className="risk-evidence-ledger"
          aria-label="Evidence supporting the current risk conclusion"
        />
      </AnalyticalSection>

      <AnalyticalSection title="Supporting signals" className="risk-detail-section risk-supporting-section">
        {positiveFactors.length > 3 ? (
          <ul className="risk-reason-list">
            {positiveFactors.slice(3).map((factor) => (
              <li key={factor.name}>
                <span>{factor.name}: {factor.value}</span>
                <strong>{formatSignedRiskPoints(factor.pts)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="risk-section-note">No additional positive signals beyond the primary explanation.</p>
        )}
      </AnalyticalSection>

      <MetadataRows items={contextItems} layout="inline" className="risk-secondary-context" aria-label="Project context" />
    </div>
  );
}

export function RiskSelectedDrivers({ row }) {
  const dimensions = Object.entries(row.dims ?? {});
  return (
    <div className="risk-selected-drivers canonical-detail-flow">
      <AnalyticalSection title="Canonical risk factors" className="risk-detail-section">
        <div className="risk-driver-list">
          {row.riskScore.factors.map((factor) => (
            <div key={factor.name} className="risk-driver-row">
              <span><strong>{factor.name}</strong><small>{factor.value}</small></span>
              <strong>{formatSignedRiskPoints(factor.pts)}</strong>
            </div>
          ))}
        </div>
      </AnalyticalSection>

      <AnalyticalSection title="Risk dimensions" className="risk-detail-section">
        <div className="risk-dimension-grid">
          {dimensions.map(([name, level]) => (
            <div key={name}>
              <span>{name}</span>
              <StatusBadge tone={riskLevelToTone(level)}>{level}</StatusBadge>
            </div>
          ))}
        </div>
      </AnalyticalSection>

      <AnalyticalSection title="Escalations & existing recommendations" className="risk-detail-section">
        {row.escalations?.length > 0 && (
          <div className="risk-driver-list">
            {row.escalations.map((item, index) => (
              <div key={`${item.type}-${index}`} className="risk-driver-row">
                <span>{item.label}</span>
                <strong>{item.severity}</strong>
              </div>
            ))}
          </div>
        )}
        {row.actions?.length > 0 ? (
          <div className="risk-action-list">
            {row.actions.map((item, index) => (
              <div key={`${item.action}-${index}`}>
                <strong>{item.action}</strong>
                <span>{item.reason}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No engine recommendations" description="The existing engine exposes no recommendation for this project; no Action lifecycle is created here." />
        )}
      </AnalyticalSection>

      <MetadataRows
        layout="inline"
        className="risk-secondary-context"
        aria-label="Driver source context"
        items={[
          { label: 'Source', value: 'Risk snapshot · current engine output' },
          { label: 'Reports', value: `${row.sorted?.length ?? 0} contractor reports` },
          { label: 'Visits', value: `${row.projSiteVisits?.length ?? 0} PM site visits` },
          { label: 'Confidence', value: row.confidence?.label || row.confidence?.level || 'Confidence unavailable' },
        ]}
      />
    </div>
  );
}
