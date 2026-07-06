import { formatDate } from '../../utils/reportUtils';

const OPEN_STYLES = {
  Ready:     { color: 'var(--status-done)',  bg: 'var(--status-done-bg)'  },
  'At Risk': { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)'  },
  Critical:  { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)' },
  Overdue:   { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)' },
  'No Date': { color: 'var(--text-muted)',   bg: 'var(--bg-elevated)'     },
};

const VERDICT_STYLES = {
  READY_TRACK:     { color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  label: 'On track to close' },
  TIGHT:           { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  label: 'Tight — no slack' },
  NOT_ACHIEVABLE:  { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', label: 'Not achievable at current pace' },
};

const fallback = { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };

const ROLE_LABEL = { GC: 'GC', PM: 'PM', Landlord: 'Landlord' };

/**
 * @param {{ opening: {
 *   daysToOpening: number|null, status: string, targetDate: string, blockerCount: number,
 *   requiredDays?: number, slack?: number|null, verdict?: string|null,
 *   criticalChain?: Array<{ wpId, task, level, status, responsibleRole, remainingDays }>,
 * } }} props
 */
export default function TimelineFlag({ opening }) {
  const os = OPEN_STYLES[opening.status] || fallback;
  const vs = opening.verdict ? VERDICT_STYLES[opening.verdict] : null;

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

          {/* A3: can the remaining blockers actually close in time? */}
          {vs && opening.requiredDays > 0 && (
            <div data-testid="opening-verdict" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: vs.color }}>{vs.label}</span>
                <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: vs.bg, color: vs.color, border: '1px solid var(--border)' }}>
                  {opening.slack >= 0 ? `+${opening.slack}d slack` : `short ${Math.ceil(-opening.slack)}d`}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: opening.criticalChain?.length ? 10 : 0 }}>
                Needs ~{Math.ceil(opening.requiredDays)}d to close remaining blockers · {opening.daysToOpening}d left
              </div>

              {opening.criticalChain?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>
                    Critical path, in closing order
                  </div>
                  <div data-testid="opening-critical-chain" style={{ display: 'grid', gap: 4 }}>
                    {opening.criticalChain.map((b, i) => (
                      <div key={b.wpId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <span style={{ color: 'var(--text-muted)', width: 14, flexShrink: 0 }}>{i + 1}.</span>
                        <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.task}</span>
                        {b.responsibleRole && (
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{ROLE_LABEL[b.responsibleRole] || b.responsibleRole}</span>
                        )}
                        <span style={{ color: b.level === 'critical' ? 'var(--status-alert)' : 'var(--status-warn)', fontWeight: 700, flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
                          {Math.ceil(b.remainingDays)}d
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
