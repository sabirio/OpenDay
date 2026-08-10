import { formatDate } from '../../utils/reportUtils';
import { formatSignedRiskPoints } from '../../hooks/useRiskLevelPresentation';
import StatusBadge from '../shared/StatusBadge.jsx';
import { riskLevelToTone } from '../../config/statusColors';
import AttentionSurface from '../shared/detail/AttentionSurface.jsx';
import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';
import EmptyState from '../shared/detail/EmptyState.jsx';
import EvidenceLedger from '../shared/detail/EvidenceLedger.jsx';
import MetadataRows from '../shared/detail/MetadataRows.jsx';

export function RiskSelectedOverview({ row }) {
  const reportDate = row.latestReport?.reportingDate || row.latestReport?.submittedAt;
  const positiveFactors = row.riskScore.factors.filter((factor) => factor.pts > 0);
  const nextAction = row.actions?.[0];
  const operationalItems = [
    {
      label: 'Overall risk',
      value: <StatusBadge tone={riskLevelToTone(row.riskScore.level)}>{row.riskScore.level}</StatusBadge>,
    },
    {
      label: 'Schedule',
      value: row.schedDev?.predictedDelayDays > 0 ? `+${row.schedDev.predictedDelayDays} days` : 'On track',
    },
    { label: 'Opening readiness', value: row.readiness?.status || 'Unavailable' },
    { label: 'Latest report', value: reportDate ? formatDate(reportDate) : 'No contractor report' },
    { label: 'Evidence confidence', value: row.confidence?.label || row.confidence?.level || 'Unavailable' },
  ];

  const evidenceItems = [
    { label: 'Contractor reports', value: row.sorted?.length ?? 0 },
    { label: 'Latest report', value: reportDate ? formatDate(reportDate) : 'Unavailable' },
    { label: 'PM site visits', value: row.projSiteVisits?.length ?? 0 },
    { label: 'Escalations', value: row.escalations?.length ?? 0 },
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
        title="Current risk & attention"
        id="risk-current-heading"
        className="risk-attention-surface"
        accessory={(
          <StatusBadge tone={riskLevelToTone(row.riskScore.level)}>
            {row.riskScore.level} · score {row.riskScore.score}
          </StatusBadge>
        )}
      >
        {positiveFactors.length > 0 ? (
          <ul className="risk-attention-list">
            {positiveFactors.slice(0, 2).map((factor) => (
              <li key={factor.name}>
                <strong>{factor.name}</strong>
                <span>Risk engine · {formatSignedRiskPoints(factor.pts)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No positive risk factors" description="The current risk model exposes no positive risk factors." />
        )}
      </AttentionSurface>

      <AnalyticalSection title="Operational risk" className="risk-detail-section">
        <MetadataRows items={operationalItems} columns={5} className="risk-operational-strip" />
      </AnalyticalSection>

      <AnalyticalSection title="Risk drivers" className="risk-detail-section">
        {positiveFactors.length > 0 ? (
          <ul className="risk-reason-list">
            {positiveFactors.map((factor) => (
              <li key={factor.name}>
                <span>{factor.name}</span>
                <strong>{formatSignedRiskPoints(factor.pts)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No positive risk factors" description="No positive risk factors are present in the current engine output." />
        )}
      </AnalyticalSection>

      <AnalyticalSection title="Evidence summary" className="risk-detail-section">
        <EvidenceLedger items={evidenceItems} layout="grid" columns={4} contained className="risk-evidence-ledger" />
      </AnalyticalSection>

      <AnalyticalSection title="Inspect next" className="risk-detail-section">
        {nextAction ? (
          <div className="risk-next-action">
            <strong>{nextAction.action}</strong>
            <span>{nextAction.reason}</span>
          </div>
        ) : (
          <EmptyState title="No queued action" description="Review the current drivers and evidence ledger." />
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
              <span>{factor.name}</span>
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

      <AnalyticalSection title="Escalations & engine actions" className="risk-detail-section">
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
          <EmptyState title="No engine actions" description="The existing action engine exposes no actions for this project." />
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
