import { OPENING_STATUS_COLORS } from '../../config/statusColors';
import { formatDate } from '../../utils/reportUtils';

/** @param {{ opening: { daysToOpening: number|null, status: string, targetDate: string, blockerCount: number } }} props */
export default function TimelineFlag({ opening }) {
  const OPEN_COLOR = OPENING_STATUS_COLORS;
  return (
    <div data-testid="opening-readiness-status" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 10 }}>Opening Readiness</div>
      {opening.daysToOpening === null ? (
        <div style={{ color: '#6b7280', fontSize: 13, fontStyle: 'italic', marginTop: 22, textAlign: 'center' }}>No target date set</div>
      ) : (
        <>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 46, fontWeight: 800, color: OPEN_COLOR[opening.status] || '#9ca3af', lineHeight: 1 }}>
              {opening.daysToOpening < 0 ? `${Math.abs(opening.daysToOpening)}d` : opening.daysToOpening === 0 ? 'Today' : `${opening.daysToOpening}d`}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{opening.daysToOpening < 0 ? 'OVERDUE' : opening.daysToOpening === 0 ? 'Opens today' : 'to opening'}</div>
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: '#9ca3af' }}>Status</span>
              <span data-testid="opening-risk-badge" style={{ padding: '2px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: (OPEN_COLOR[opening.status] || '#9ca3af') + '22', color: OPEN_COLOR[opening.status] || '#9ca3af', border: `1px solid ${(OPEN_COLOR[opening.status] || '#9ca3af')}55` }}>{opening.status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#9ca3af' }}>Target date</span>
              <span style={{ color: '#f9fafb', fontWeight: 600 }}>{formatDate(opening.targetDate)}</span>
            </div>
            {opening.blockerCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#9ca3af' }}>Active blockers</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{opening.blockerCount}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
