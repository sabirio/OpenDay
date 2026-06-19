import { formatDate } from '../../utils/reportUtils';

const OPEN_STYLES = {
  Ready:     { color: 'var(--status-done)',  bg: 'var(--status-done-bg)'  },
  'At Risk': { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)'  },
  Critical:  { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)' },
  Overdue:   { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)' },
  'No Date': { color: 'var(--text-muted)',   bg: 'var(--bg-elevated)'     },
};

const fallback = { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };

/** @param {{ opening: { daysToOpening: number|null, status: string, targetDate: string, blockerCount: number } }} props */
export default function TimelineFlag({ opening }) {
  const os = OPEN_STYLES[opening.status] || fallback;
  return (
    <div data-testid="opening-readiness-status" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>Opening Readiness</div>
      {opening.daysToOpening === null ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginTop: 22, textAlign: 'center' }}>No target date set</div>
      ) : (
        <>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 46, fontWeight: 800, color: os.color, lineHeight: 1 }}>
              {opening.daysToOpening < 0 ? `${Math.abs(opening.daysToOpening)}d` : opening.daysToOpening === 0 ? 'Today' : `${opening.daysToOpening}d`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{opening.daysToOpening < 0 ? 'OVERDUE' : opening.daysToOpening === 0 ? 'Opens today' : 'to opening'}</div>
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Status</span>
              <span data-testid="opening-risk-badge" style={{ padding: '2px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: os.bg, color: os.color, border: '1px solid var(--border)' }}>{opening.status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Target date</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatDate(opening.targetDate)}</span>
            </div>
            {opening.blockerCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Active blockers</span>
                <span style={{ color: 'var(--status-alert)', fontWeight: 700 }}>{opening.blockerCount}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
