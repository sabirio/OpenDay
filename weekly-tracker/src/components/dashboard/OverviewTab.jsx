import { formatDate } from '../../utils/reportUtils';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

const FLAG_ALERT = { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' };
const FLAG_WARN  = { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' };

function DonutChart({ counts, total }) {
  const r = 62;
  const cx = 90, cy = 90;
  const circ = 2 * Math.PI * r;
  const safeTotal = Math.max(total, 1);

  const segments = [
    { label: 'On Track',  key: 'On Track',  color: 'var(--text-primary)'  },
    { label: 'At Risk',   key: 'At Risk',   color: 'var(--status-warn)'   },
    { label: 'Delayed',   key: 'Delayed',   color: 'var(--status-warn)'   },
    { label: 'Critical',  key: 'Critical',  color: 'var(--status-alert)'  },
    { label: 'No Report', key: null,        color: 'var(--border-strong)' },
  ];

  const allOnTrack = total > 0 && (counts['On Track'] ?? 0) === total;

  let cumOffset = 0;
  const arcs = segments.map(seg => {
    const n = counts[seg.key] ?? 0;
    const segLen = (n / safeTotal) * circ;
    const dashoffset = circ - cumOffset;
    cumOffset += segLen;
    return { ...seg, n, segLen, dashoffset };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={180} height={180} viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={28} />
        {allOnTrack ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--text-primary)" strokeWidth={28} />
        ) : arcs.map(({ label, color, n, segLen, dashoffset }) =>
          n > 0 ? (
            <circle
              key={label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={color}
              strokeWidth={28}
              strokeDasharray={`${segLen} ${circ - segLen}`}
              strokeDashoffset={dashoffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '90px 90px' }}
            />
          ) : null
        )}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={32} fontWeight={800} fill="var(--text-primary)">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="var(--text-muted)">Projects</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map(({ label, key, color }) => {
          const n = counts[key] ?? 0;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, opacity: n === 0 ? 0.3 : 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 76 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: n === 0 ? 'var(--text-muted)' : color }}>{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OverviewTab({ allRows, projects, kpis, onSelect }) {
  const total = projects.length;
  const counts = {
    'On Track': allRows.filter(r => r.latestReport?.projectScheduleStatus === 'On Track').length,
    'At Risk':  allRows.filter(r => r.latestReport?.projectScheduleStatus === 'At Risk').length,
    'Delayed':  allRows.filter(r => r.latestReport?.projectScheduleStatus === 'Delayed').length,
    'Critical': allRows.filter(r => r.latestReport?.projectScheduleStatus === 'Critical').length,
    null:       allRows.filter(r => !r.latestReport).length,
  };

  const flagItems = [
    { l: 'Blockers', v: kpis.blocked,  ...FLAG_ALERT },
    { l: 'Support',  v: kpis.support,  ...FLAG_WARN  },
    { l: 'Critical', v: kpis.critical, ...FLAG_ALERT },
  ];
  const allFlagsZero = flagItems.every(i => i.v === 0);
  const nonZeroFlags = flagItems.filter(i => i.v > 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Portfolio Health */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Portfolio Health</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Schedule status distribution</div>
        <DonutChart counts={counts} total={total} />
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {allFlagsZero ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0.5rem 0', textAlign: 'center' }}>
              ✓ No blockers · ✓ No support required · ✓ No critical issues
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              {nonZeroFlags.map(({ l, v, color, bg, border }) => (
                <div key={l} style={{ flex: 1, textAlign: 'center', background: bg, borderRadius: 9, padding: '10px 6px', border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color }}>{v}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Opening Countdown */}
      {(() => {
        const withOpening = [...allRows.filter(r => r.daysToOpening !== null)].sort((a, b) => a.daysToOpening - b.daysToOpening);
        if (withOpening.length === 0) return null;
        return (
          <div className="dashboard-summary-card" style={{ margin: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Opening Countdown</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Projects sorted by nearest target opening date</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dashboard-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr><th>Project</th><th>Target Opening</th><th>Days Left</th><th>Progress</th><th>Schedule</th><th>Risk</th><th>Flag</th></tr>
                </thead>
                <tbody>
                  {withOpening.map(({ project, latestReport, progress, daysToOpening, riskLevel }) => {
                    const dToC       = daysToOpening < 0 ? 'var(--status-alert)' : daysToOpening < 30 ? 'var(--status-alert)' : daysToOpening < 90 ? 'var(--status-warn)' : 'var(--status-done)';
                    const isCritical = daysToOpening < 30 && progress < 80;
                    const isWarn     = !isCritical && daysToOpening < 60 && progress < 60;
                    const progColor  = progress >= 75 ? 'var(--status-done)' : progress >= 40 ? 'var(--accent)' : 'var(--status-warn)';
                    return (
                      <tr key={project.id} onClick={() => onSelect(String(project.id))} style={{ cursor: 'pointer', background: isCritical ? 'var(--status-alert-bg)' : isWarn ? 'var(--status-warn-bg)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{project.storeCode}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{project.shoppingMallName}</div>
                        </td>
                        <td style={{ fontSize: 13, color: dToC, fontWeight: 600 }}>{formatDate(project.targetOpeningDate)}</td>
                        <td style={{ fontSize: 14, fontWeight: 800, color: dToC }}>{daysToOpening < 0 ? `${Math.abs(daysToOpening)}d OVR` : daysToOpening === 0 ? 'Today' : `${daysToOpening}d`}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 52, background: 'var(--border)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${progress}%`, height: '100%', background: progColor, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{progress}%</span>
                          </div>
                        </td>
                        <td><SchedBadge status={latestReport?.projectScheduleStatus} /></td>
                        <td><RiskBadge level={riskLevel} /></td>
                        <td>
                          {isCritical
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-alert)', padding: '2px 7px', borderRadius: 6, background: 'var(--status-alert-bg)', border: '1px solid var(--border)' }}>CRITICAL</span>
                            : isWarn
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-warn)', padding: '2px 7px', borderRadius: 6, background: 'var(--status-warn-bg)', border: '1px solid var(--border)' }}>WARNING</span>
                              : <span style={{ fontSize: 11, color: 'var(--status-done)', fontWeight: 600 }}>OK</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
