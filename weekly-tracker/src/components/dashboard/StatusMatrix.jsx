import { formatDate } from '../../utils/reportUtils';
import { getOpeningUrgencyColor, getReportAgeColor } from '../../config/statusColors';
import { SchedBadge, RiskBadge } from './DashboardWidgets';
import { useStatusMatrixRows } from '../../hooks/useStatusMatrixRows';

function reportTag({ latestReport, daysSinceReport }) {
  if (!latestReport)         return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-alert)' }}>Missing</span>;
  const color = getReportAgeColor(daysSinceReport);
  if (daysSinceReport === 0) return <span style={{ fontSize: 11, color }}>Today</span>;
  if (daysSinceReport <= 14) return <span style={{ fontSize: 11, color }}>{daysSinceReport}d ago</span>;
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>Overdue {daysSinceReport}d</span>;
}

export default function StatusMatrix({ rows, alerts, drawerProjectId, onSelect, snapshotData = {}, snapshotMode = false }) {
  const matrixRows = useStatusMatrixRows(rows, snapshotData, snapshotMode);

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>Project Status Matrix</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Sorted by priority · click row to open project</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table" style={{ width: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th>Store Code</th>
              <th style={{ minWidth: 140 }}>Current Phase</th><th>Progress</th><th>Schedule</th><th>Risk Level</th>
              <th>Blockers</th><th>Support Required</th><th>Alert</th>
              <th>Target Opening</th><th>Days Left</th><th>Latest Report</th><th>Report Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="12" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No matching projects.</td></tr>
            ) : matrixRows.map((row) => {
              const { project, latestReport, color, daysToOpening, daysSinceReport, riskLevel, missingReport, phase, displayProgress, noSnapData, delta } = row;
              const schedStatus = latestReport?.projectScheduleStatus;
              const isOpen      = drawerProjectId === String(project.id);
              const dToC        = getOpeningUrgencyColor(daysToOpening);

              return (
                <tr
                  key={project.id}
                  data-testid="dashboard-project-row"
                  data-project-id={String(project.id)}
                  onClick={snapshotMode ? undefined : () => onSelect(String(project.id))}
                  style={{ cursor: snapshotMode ? 'default' : 'pointer', background: isOpen ? 'var(--status-done-bg)' : undefined, transition: 'background 0.15s' }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                      {isOpen && <span style={{ color: 'var(--status-done)', fontSize: 10 }}>▶</span>}
                      <strong style={{ color: 'var(--text-primary)' }}>{project.storeCode}</strong>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 140, whiteSpace: 'nowrap' }}>{phase || <span style={{ color: 'var(--text-muted)' }}>No report</span>}</td>
                  <td>
                    {noSnapData ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <div style={{ width: 48, background: 'var(--border)', borderRadius: 3, height: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${displayProgress}%`, height: '100%', background: 'var(--progress-fill)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', minWidth: 28 }}>{displayProgress}%</span>
                        {delta && (
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: delta.direction === 'up' ? 'var(--status-done)' : delta.direction === 'down' ? 'var(--status-alert)' : 'var(--text-muted)',
                          }}>
                            {delta.label}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td><SchedBadge status={schedStatus} /></td>
                  <td><RiskBadge level={riskLevel} /></td>
                  <td>{latestReport?.activitiesBlocked ? <span style={{ fontSize: 12, fontWeight: 700, color: latestReport.activitiesBlocked === 'Yes' ? 'var(--status-alert)' : 'var(--status-done)' }}>{latestReport.activitiesBlocked}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{latestReport?.supportRequired ? <span style={{ fontSize: 12, fontWeight: 700, color: latestReport.supportRequired === 'Yes' ? 'var(--status-warn)' : 'var(--status-done)' }}>{latestReport.supportRequired}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{alerts.some(a => String(a.pid) === String(project.id)) ? <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: '1px solid var(--border)' }}>Yes</span> : <span style={{ fontSize: 12, color: 'var(--status-done)', fontWeight: 600 }}>No</span>}</td>
                  <td style={{ fontSize: 12, fontWeight: 600, color: dToC, whiteSpace: 'nowrap' }}>{project.targetOpeningDate ? formatDate(project.targetOpeningDate) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ fontWeight: 700, fontSize: 12, color: dToC, whiteSpace: 'nowrap' }}>
                    {daysToOpening === null ? '—' : daysToOpening < 0 ? `${Math.abs(daysToOpening)}d OVR` : daysToOpening === 0 ? 'Today' : `${daysToOpening}d`}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{reportTag({ latestReport, daysSinceReport, missingReport })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
