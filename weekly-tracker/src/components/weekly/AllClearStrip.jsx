import { TextBlock, InfoLabel } from './shared';

export default function AllClearStrip({ report }) {
  if (!report) return null;

  const hasRisk    = (report.risks || []).filter(Boolean).length > 0 || report.riskDescription || report.riskScale;
  const hasSupport = report.supportRequired === 'Yes';
  const isBlocked  = report.activitiesBlocked === 'Yes';

  if (!hasRisk && !hasSupport && !isBlocked) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 20px', background: '#064e3b', border: '1px solid #065f46', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7' }}>✓ No risks reported</span>
        <span style={{ color: '#065f46' }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7' }}>✓ No support required</span>
        <span style={{ color: '#065f46' }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6ee7b7' }}>✓ Not blocked</span>
      </div>
    );
  }

  const riskScaleChip = {
    High:   { bg: '#7f1d1d', color: '#fca5a5', border: '#991b1b' },
    Medium: { bg: '#7c2d12', color: '#fdba74', border: '#92400e' },
    Low:    { bg: '#064e3b', color: '#6ee7b7', border: '#065f46' },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
      {/* Risk Details */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#f9fafb' }}>Risk Details</div>
        {hasRisk ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              {report.riskScale && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 5 }}>Scale</div>
                  {(() => {
                    const c = riskScaleChip[report.riskScale] ?? { bg: '#374151', color: '#9ca3af', border: '#4b5563' };
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
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: '#7c2d12', color: '#fdba74', border: '1px solid #92400e' }}>{r}</span>
                ))}
              </div>
            )}
            <TextBlock label="Description" value={report.riskDescription} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✓ No risks reported</div>
        )}
      </div>

      {/* Client Support */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#f9fafb' }}>Client Support</div>
        {hasSupport ? (
          <>
            {report.supportTypes?.filter(Boolean).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {report.supportTypes.filter(Boolean).map((t, i) => (
                  <span key={i} style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#164e63', color: '#67e8f9', border: '1px solid #0e7490' }}>{t}</span>
                ))}
              </div>
            )}
            <TextBlock label="Description" value={report.supportDescription} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✓ No support required</div>
        )}
      </div>

      {/* Blocked */}
      {isBlocked && (
        <div className="dashboard-summary-card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#fca5a5' }}>Activities Blocked</div>
          <TextBlock label="Delay Reason" value={report.delayReason} />
        </div>
      )}
    </div>
  );
}
