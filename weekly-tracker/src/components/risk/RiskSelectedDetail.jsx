import { formatDate } from '../../utils/reportUtils';
import { formatSignedRiskPoints } from '../../hooks/useRiskLevelPresentation';

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

  return (
    <div className="risk-selected-overview">
      <DetailSection title="Why this project is at risk">
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
          <p className="risk-detail-empty">The canonical risk model exposes no positive risk factors for this project.</p>
        )}
      </DetailSection>

      <DetailSection title="Schedule & progress">
        <dl className="risk-detail-grid">
          <DetailField label="Expected progress">{row.schedDev ? `${row.schedDev.expectedPct}%` : 'Unavailable'}</DetailField>
          <DetailField label="Actual progress">{row.schedDev ? `${row.schedDev.actualPct}%` : `${row.progress}%`}</DetailField>
          <DetailField label="Schedule deviation">{row.schedDev ? `${row.schedDev.deviationPct > 0 ? '−' : ''}${row.schedDev.deviationPct}%` : 'Unavailable'}</DetailField>
          <DetailField label="Predicted delay">{row.schedDev?.predictedDelayDays > 0 ? `+${row.schedDev.predictedDelayDays} days` : 'On track'}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Readiness & reporting">
        <dl className="risk-detail-grid">
          <DetailField label="Opening readiness">{row.readiness?.status || 'Unavailable'}</DetailField>
          <DetailField label="Readiness verdict">{row.readiness?.verdict || 'Unavailable'}</DetailField>
          <DetailField label="Latest report">{reportDate ? formatDate(reportDate) : 'No contractor report'}</DetailField>
          <DetailField label="Reports submitted">{row.sorted?.length ?? 0}</DetailField>
          <DetailField label="PM site visits">{row.projSiteVisits?.length ?? 0}</DetailField>
          <DetailField label="Data confidence">{row.confidence?.label || row.confidence?.level || 'Unavailable'}</DetailField>
        </dl>
      </DetailSection>

      <DetailSection title="Operational context">
        <dl className="risk-detail-grid">
          <DetailField label="Health">{row.health?.label || `${row.health?.score ?? '—'}`}</DetailField>
          <DetailField label="Contractor performance">{row.contScore?.performanceScore ?? 'Unavailable'}</DetailField>
          <DetailField label="PM alignment">{row.contScore?.pmAlignmentScore ?? 'Unavailable'}</DetailField>
          <DetailField label="Escalations">{row.escalations?.length ?? 0}</DetailField>
        </dl>
      </DetailSection>
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
              <strong className={`risk-master-level is-${String(level).toLowerCase()}`}>{level}</strong>
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
    </div>
  );
}
