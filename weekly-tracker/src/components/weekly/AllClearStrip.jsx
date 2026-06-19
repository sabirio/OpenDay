import { TextBlock, InfoLabel } from './shared';

const RISK_CHIP = {
  High:   { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: 'var(--border)' },
  Medium: { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn)',  border: 'var(--border)' },
  Low:    { bg: 'var(--status-done-bg)',  color: 'var(--status-done)',  border: 'var(--border)' },
};
const RISK_FALLBACK = { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', border: 'var(--border)' };

export default function AllClearStrip({ report }) {
  if (!report) return null;

  const hasRisk    = (report.risks || []).filter(Boolean).length > 0 || report.riskDescription || report.riskScale;
  const hasSupport = report.supportRequired === 'Yes';
  const isBlocked  = report.activitiesBlocked === 'Yes';

  if (!hasRisk && !hasSupport && !isBlocked) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 20px', background: 'var(--status-done-bg)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-done)' }}>✓ No risks reported</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-done)' }}>✓ No support required</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-done)' }}>✓ Not blocked</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
      {/* Risk Details */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text-primary)' }}>Risk Details</div>
        {hasRisk ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              {report.riskScale && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>Scale</div>
                  {(() => {
                    const c = RISK_CHIP[report.riskScale] ?? RISK_FALLBACK;
                    return (
                      <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                        {report.riskScale}
                      </span>
                    );
                  })()}
                </div>
              )}
              {report.riskOwners?.filter(Boolean).length > 0 && (
                <InfoLabel label="Owners">{report.riskOwners.filter(Boolean).join(', ')}</InfoLabel>
              )}
            </div>
            {(report.risks || []).filter(Boolean).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {report.risks.filter(Boolean).map((r, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--status-warn-bg)', color: 'var(--status-warn)', border: '1px solid var(--border)' }}>{r}</span>
                ))}
              </div>
            )}
            <TextBlock label="Description" value={report.riskDescription} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--status-done)', fontWeight: 600 }}>✓ No risks reported</div>
        )}
      </div>

      {/* Client Support */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text-primary)' }}>Client Support</div>
        {hasSupport ? (
          <>
            {report.supportTypes?.filter(Boolean).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {report.supportTypes.filter(Boolean).map((t, i) => (
                  <span key={i} style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--border)' }}>{t}</span>
                ))}
              </div>
            )}
            <TextBlock label="Description" value={report.supportDescription} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--status-done)', fontWeight: 600 }}>✓ No support required</div>
        )}
      </div>

      {/* Blocked */}
      {isBlocked && (
        <div className="dashboard-summary-card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--status-alert)' }}>Activities Blocked</div>
          <TextBlock label="Delay Reason" value={report.delayReason} />
        </div>
      )}
    </div>
  );
}
