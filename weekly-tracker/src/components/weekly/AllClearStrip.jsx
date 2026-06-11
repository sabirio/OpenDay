// Shows a compact "all clear" row if no risks/blockers/support requests.
// When content exists, renders the relevant cards.
import { TextBlock, InfoLabel } from './shared';

export default function AllClearStrip({ report }) {
  if (!report) return null;

  const hasRisk    = (report.risks || []).filter(Boolean).length > 0 || report.riskDescription || report.riskScale;
  const hasSupport = report.supportRequired === 'Yes';
  const isBlocked  = report.activitiesBlocked === 'Yes';

  if (!hasRisk && !hasSupport && !isBlocked) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 20px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✓ No risks reported</span>
        <span style={{ color: '#bbf7d0' }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✓ No support required</span>
        <span style={{ color: '#bbf7d0' }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✓ Not blocked</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
      {/* Risk Details */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#111827' }}>Risk Details</div>
        {hasRisk ? (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              {report.riskScale && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 5 }}>Scale</div>
                  <span style={{
                    display: 'inline-block', padding: '3px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: report.riskScale === 'High' ? '#fef2f2' : report.riskScale === 'Medium' ? '#fffbeb' : '#f0fdf4',
                    color: report.riskScale === 'High' ? '#dc2626' : report.riskScale === 'Medium' ? '#d97706' : '#16a34a',
                    border: `1px solid ${report.riskScale === 'High' ? '#fecaca' : report.riskScale === 'Medium' ? '#fde68a' : '#bbf7d0'}`,
                  }}>{report.riskScale}</span>
                </div>
              )}
              {report.riskOwners?.filter(Boolean).length > 0 && (
                <InfoLabel label="Owners">{report.riskOwners.filter(Boolean).join(', ')}</InfoLabel>
              )}
            </div>
            {(report.risks || []).filter(Boolean).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {report.risks.filter(Boolean).map((r, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>{r}</span>
                ))}
              </div>
            )}
            <TextBlock label="Description" value={report.riskDescription} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>✓ No risks reported</div>
        )}
      </div>

      {/* Client Support */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#111827' }}>Client Support</div>
        {hasSupport ? (
          <>
            {report.supportTypes?.filter(Boolean).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {report.supportTypes.filter(Boolean).map((t, i) => (
                  <span key={i} style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe' }}>{t}</span>
                ))}
              </div>
            )}
            <TextBlock label="Description" value={report.supportDescription} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>✓ No support required</div>
        )}
      </div>

      {/* Blocked */}
      {isBlocked && (
        <div className="dashboard-summary-card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#dc2626' }}>Activities Blocked</div>
          <TextBlock label="Delay Reason" value={report.delayReason} />
        </div>
      )}
    </div>
  );
}
