import { formatDate } from '../../utils/reportUtils';
import { formatSignedRiskPoints } from '../../hooks/useRiskLevelPresentation';
import StatusBadge from '../shared/StatusBadge.jsx';
import { riskLevelToTone } from '../../config/statusColors';

function DetailField({ label, children }) {
  return (
    <div className="risk-detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="risk-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function RiskSelectedOverview({ row }) {
  const reportDate = row.latestReport?.reportingDate || row.latestReport?.submittedAt;
  const positiveFactors = row.riskScore.factors.filter((factor) => factor.pts > 0);
  const nextAction = row.actions?.[0];

  return (
    <div className="risk-selected-overview">
      <section className="risk-attention-surface" aria-labelledby="risk-current-heading">
        <div className="risk-section-heading">
          <h3 id="risk-current-heading">Current risk & attention</h3>
          <StatusBadge tone={riskLevelToTone(row.riskScore.level)}>
            {row.riskScore.level} · score {row.riskScore.score}
          </StatusBadge>
        </div>
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
          <p className="risk-detail-empty">The current risk model exposes no positive risk factors.</p>
        )}
      </section>

      <DetailSection title="Operational risk">
        <dl className="risk-operational-strip">
          <DetailField label="Overall risk">
            <StatusBadge tone={riskLevelToTone(row.riskScore.level)}>{row.riskScore.level}</StatusBadge>
          </DetailField>
          <DetailField label="Schedule">
            {row.schedDev?.predictedDelayDays > 0 ? `+${row.schedDev.predictedDelayDays} days` : 'On track'}
          </DetailField>
          <DetailField label="Opening readiness">{row.readiness?.status || 'Unavailable'}</DetailField>
          <DetailField label="Latest report">{reportDate ? formatDate(reportDate) : 'No contractor report'}</DetailField>
          <DetailField label="Evidence confidence">{row.confidence?.label || row.confidence?.level || 'Unavailable'}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Risk drivers">
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
          <p className="risk-detail-empty">No positive risk factors are present in the current engine output.</p>
        )}
      </DetailSection>

      <DetailSection title="Evidence summary">
        <dl className="risk-evidence-ledger">
          <DetailField label="Contractor reports">{row.sorted?.length ?? 0}</DetailField>
          <DetailField label="Latest report">{reportDate ? formatDate(reportDate) : 'Unavailable'}</DetailField>
          <DetailField label="PM site visits">{row.projSiteVisits?.length ?? 0}</DetailField>
          <DetailField label="Escalations">{row.escalations?.length ?? 0}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Inspect next">
        {nextAction ? (
          <div className="risk-next-action">
            <strong>{nextAction.action}</strong>
            <span>{nextAction.reason}</span>
          </div>
        ) : (
          <p className="risk-detail-empty">Review the current drivers and evidence ledger.</p>
        )}
      </DetailSection>

      <section className="risk-secondary-context" aria-label="Project context">
        <span>{row.project.generalContractor || 'Contractor unavailable'}</span>
        <span>{row.progress}% progress</span>
        <span>{row.health?.label || `Health ${row.health?.score ?? '—'}`}</span>
        <span>{row.contScore?.performanceScore ?? '—'} contractor performance</span>
        <span>{row.contScore?.pmAlignmentScore ?? '—'} PM alignment</span>
      </section>
    </div>
  );
}

export function RiskSelectedDrivers({ row }) {
  const dimensions = Object.entries(row.dims ?? {});
  return (
    <div className="risk-selected-drivers">
      <DetailSection title="Canonical risk factors">
        <div className="risk-driver-list">
          {row.riskScore.factors.map((factor) => (
            <div key={factor.name} className="risk-driver-row">
              <span>{factor.name}</span>
              <strong>{formatSignedRiskPoints(factor.pts)}</strong>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Risk dimensions">
        <div className="risk-dimension-grid">
          {dimensions.map(([name, level]) => (
            <div key={name}>
              <span>{name}</span>
              <StatusBadge tone={riskLevelToTone(level)}>{level}</StatusBadge>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Escalations & engine actions">
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
          <p className="risk-detail-empty">The existing action engine exposes no actions for this project.</p>
        )}
      </DetailSection>

      <section className="risk-secondary-context" aria-label="Driver source context">
        <span>Risk snapshot · current engine output</span>
        <span>{row.sorted?.length ?? 0} contractor reports</span>
        <span>{row.projSiteVisits?.length ?? 0} PM site visits</span>
        <span>{row.confidence?.label || row.confidence?.level || 'Confidence unavailable'}</span>
      </section>
    </div>
  );
}
