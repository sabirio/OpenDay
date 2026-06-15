import { formatDate } from '../../utils/reportUtils';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

const T = {
  surface:   'rgba(255,255,255,0.04)',
  border:    '#374151',
  textPri:   '#f9fafb',
  textBody:  '#e5e7eb',
  textSec:   '#9ca3af',
  textMuted: '#6b7280',
};

export default function OverviewTab({ allRows, projects, kpis, onSelect }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Portfolio Health */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.textPri, marginBottom: 4 }}>Portfolio Health</div>
        <div style={{ fontSize: 12, color: T.textSec, marginBottom: 16 }}>Schedule status distribution</div>
        {(() => {
          const onTrack  = allRows.filter(({ latestReport }) => latestReport?.projectScheduleStatus === 'On Track').length;
          const atRisk   = allRows.filter(({ latestReport }) => latestReport?.projectScheduleStatus === 'At Risk').length;
          const delayed  = allRows.filter(({ latestReport }) => latestReport?.projectScheduleStatus === 'Delayed').length;
          const critical = allRows.filter(({ latestReport }) => latestReport?.projectScheduleStatus === 'Critical').length;
          const noReport = allRows.filter(({ latestReport }) => !latestReport).length;
          const total    = projects.length || 1;
          return [
            { l: 'On Track',  n: onTrack,  c: '#10b981' },
            { l: 'At Risk',   n: atRisk,   c: '#f97316' },
            { l: 'Delayed',   n: delayed,  c: '#ef4444' },
            { l: 'Critical',  n: critical, c: '#ef4444' },
            { l: 'No Report', n: noReport, c: '#4b5563' },
          ].map(({ l, n, c }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: T.textSec, width: 76, flexShrink: 0 }}>{l}</div>
              <div style={{ flex: 1, background: T.border, borderRadius: 5, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${(n / total) * 100}%`, height: '100%', background: c, borderRadius: 5, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c, width: 20, textAlign: 'right' }}>{n}</div>
            </div>
          ));
        })()}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          {[
            { l: 'Blockers', v: kpis.blocked,  c: '#ef4444' },
            { l: 'Support',  v: kpis.support,  c: '#f97316' },
            { l: 'Critical', v: kpis.critical, c: '#ef4444' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', background: v > 0 ? c + '22' : T.surface, borderRadius: 9, padding: '10px 6px', border: `1px solid ${v > 0 ? c + '55' : T.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: v > 0 ? c : '#4b5563' }}>{v}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
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
            <div style={{ fontWeight: 700, fontSize: 15, color: T.textPri, marginBottom: 4 }}>Opening Countdown</div>
            <div style={{ fontSize: 12, color: T.textSec, marginBottom: 16 }}>Projects sorted by nearest target opening date</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dashboard-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr><th>Project</th><th>Target Opening</th><th>Days Left</th><th>Progress</th><th>Schedule</th><th>Risk</th><th>Flag</th></tr>
                </thead>
                <tbody>
                  {withOpening.map(({ project, latestReport, progress, daysToOpening, riskLevel }) => {
                    const dToC       = daysToOpening < 0 ? '#ef4444' : daysToOpening < 30 ? '#ef4444' : daysToOpening < 90 ? '#f97316' : '#10b981';
                    const isCritical = daysToOpening < 30 && progress < 80;
                    const isWarn     = !isCritical && daysToOpening < 60 && progress < 60;
                    return (
                      <tr key={project.id} onClick={() => onSelect(String(project.id))} style={{ cursor: 'pointer', background: isCritical ? 'rgba(239,68,68,0.08)' : isWarn ? 'rgba(249,115,22,0.06)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 700, color: T.textPri }}>{project.storeCode}</div>
                          <div style={{ fontSize: 11, color: T.textSec }}>{project.shoppingMallName}</div>
                        </td>
                        <td style={{ fontSize: 13, color: dToC, fontWeight: 600 }}>{formatDate(project.targetOpeningDate)}</td>
                        <td style={{ fontSize: 14, fontWeight: 800, color: dToC }}>{daysToOpening < 0 ? `${Math.abs(daysToOpening)}d OVR` : daysToOpening === 0 ? 'Today' : `${daysToOpening}d`}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 52, background: T.border, borderRadius: 3, height: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${progress}%`, height: '100%', background: progress >= 75 ? '#10b981' : progress >= 40 ? '#22d3ee' : '#f97316', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.textBody }}>{progress}%</span>
                          </div>
                        </td>
                        <td><SchedBadge status={latestReport?.projectScheduleStatus} /></td>
                        <td><RiskBadge level={riskLevel} /></td>
                        <td>
                          {isCritical
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5', padding: '2px 7px', borderRadius: 6, background: '#7f1d1d', border: '1px solid #991b1b' }}>CRITICAL</span>
                            : isWarn
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#fdba74', padding: '2px 7px', borderRadius: 6, background: '#7c2d12', border: '1px solid #92400e' }}>WARNING</span>
                              : <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>OK</span>}
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
