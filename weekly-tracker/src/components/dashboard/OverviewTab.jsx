import { formatDate } from '../../utils/reportUtils';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

const HEALTH_BARS = [
  { l: 'On Track',  key: 'On Track',  c: 'var(--status-done)'  },
  { l: 'At Risk',   key: 'At Risk',   c: 'var(--status-warn)'  },
  { l: 'Delayed',   key: 'Delayed',   c: 'var(--status-alert)' },
  { l: 'Critical',  key: 'Critical',  c: 'var(--status-alert)' },
  { l: 'No Report', key: null,        c: 'var(--border-strong)' },
];

const FLAG_ALERT = { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' };
const FLAG_WARN  = { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' };

export default function OverviewTab({ allRows, projects, kpis, onSelect }) {
  const total = projects.length || 1;
  const counts = {
    'On Track': allRows.filter(r => r.latestReport?.projectScheduleStatus === 'On Track').length,
    'At Risk':  allRows.filter(r => r.latestReport?.projectScheduleStatus === 'At Risk').length,
    'Delayed':  allRows.filter(r => r.latestReport?.projectScheduleStatus === 'Delayed').length,
    'Critical': allRows.filter(r => r.latestReport?.projectScheduleStatus === 'Critical').length,
    null:       allRows.filter(r => !r.latestReport).length,
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Portfolio Health */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Portfolio Health</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Schedule status distribution</div>
        {HEALTH_BARS.map(({ l, key, c }) => {
          const n = counts[key] ?? 0;
          return (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', width: 76, flexShrink: 0 }}>{l}</div>
              <div style={{ flex: 1, background: 'var(--border)', borderRadius: 5, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: c, borderRadius: 5, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c, width: 20, textAlign: 'right' }}>{n}</div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {[
            { l: 'Blockers', v: kpis.blocked,  ...FLAG_ALERT },
            { l: 'Support',  v: kpis.support,  ...FLAG_WARN  },
            { l: 'Critical', v: kpis.critical, ...FLAG_ALERT },
          ].map(({ l, v, color, bg, border }) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', background: v > 0 ? bg : 'var(--accent-subtle)', borderRadius: 9, padding: '10px 6px', border: `1px solid ${v > 0 ? border : 'var(--border)'}` }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: v > 0 ? color : 'var(--border-strong)' }}>{v}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
            </div>
          ))}
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
