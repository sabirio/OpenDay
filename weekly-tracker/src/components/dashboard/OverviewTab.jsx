import { formatDate } from '../../utils/reportUtils';
import { getOpeningUrgencyColor } from '../../config/statusColors';
import { daysOverdueCount } from '../../hooks/useOpeningReadinessPresentation';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

export default function OverviewTab({ allRows, onSelect }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>

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
                    const dToC       = getOpeningUrgencyColor(daysToOpening);
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
                        <td style={{ fontSize: 14, fontWeight: 800, color: dToC }}>{daysToOpening < 0 ? `${daysOverdueCount(daysToOpening)}d OVR` : daysToOpening === 0 ? 'Today' : `${daysToOpening}d`}</td>
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
