import { formatDate } from '../../utils/reportUtils';
import { getOpeningUrgencyColor, getReportAgeColor } from '../../config/statusColors';
import { daysOverdueCount } from '../../hooks/useOpeningReadinessPresentation';
import { SchedBadge } from './DashboardWidgets';
import { RiskBadge } from '../RiskGauge';
import { useStatusMatrixRows } from '../../hooks/useStatusMatrixRows';

function reportTag({ latestReport, daysSinceReport, reportDueState, scheduleProjectionAvailability }) {
  // Projection Completeness Hardening: NOT_YET_DUE from an UNAVAILABLE
  // projection is the engine's conservative fallback, not a confirmed
  // fact — must not be shown as "Not yet due" (which claims we know).
  if (scheduleProjectionAvailability === 'UNAVAILABLE') {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unavailable</span>;
  }
  // Phase 3D.1: a CONTRACTOR_MANAGED project with no schedule commitment yet
  // has no reporting obligation at all — the red "Missing" badge otherwise
  // fires unconditionally off `!latestReport`, regardless of whether a
  // report was ever actually due (NO COMMITMENT YET != COMMITMENT MISSED).
  if (reportDueState === 'NOT_YET_DUE') {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Not yet due</span>;
  }
  if (!latestReport)         return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-alert)' }}>Missing</span>;
  const color = getReportAgeColor(daysSinceReport);
  if (daysSinceReport === 0) return <span style={{ fontSize: 11, color }}>Today</span>;
  if (daysSinceReport <= 14) return <span style={{ fontSize: 11, color }}>{daysSinceReport}d ago</span>;
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>Overdue {daysSinceReport}d</span>;
}

export default function StatusMatrix({ rows, alerts, drawerProjectId, onSelect, snapshotData = {}, snapshotMode = false }) {
  const matrixRows = useStatusMatrixRows(rows, snapshotData, snapshotMode);

  return (
    <div className="dashboard-summary-card status-matrix-card" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>Project Status Matrix</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Sorted by priority · click row to open project</div>
      </div>
      <div className="ds-data-surface status-matrix-scroll">
        <table className="ds-table ds-table--dense status-matrix-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Phase</th><th>Progress</th><th>Schedule</th><th>Risk</th>
              <th>Blocked</th><th>Support</th><th>Alert</th>
              <th>Target Opening</th><th>Days Left</th><th>Latest Report</th><th>Report Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="12" className="ds-table-empty">No matching projects.</td></tr>
            ) : matrixRows.map((row) => {
              const { project, latestReport, color, daysToOpening, daysSinceReport, riskLevel, missingReport, phase, displayProgress, noSnapData, delta, reportDueState, scheduleProjectionAvailability } = row;
              const schedStatus = latestReport?.projectScheduleStatus;
              const isOpen      = drawerProjectId === String(project.id);
              const dToC        = getOpeningUrgencyColor(daysToOpening);

              return (
                <tr
                  key={project.id}
                  data-testid="dashboard-project-row"
                  data-project-id={String(project.id)}
                  onClick={snapshotMode ? undefined : () => onSelect(String(project.id))}
                  onKeyDown={snapshotMode ? undefined : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(String(project.id));
                    }
                  }}
                  tabIndex={snapshotMode ? undefined : 0}
                  aria-selected={snapshotMode ? undefined : isOpen}
                  className={isOpen ? 'is-selected' : undefined}
                  style={{ cursor: snapshotMode ? 'default' : 'pointer', transition: 'background 0.15s' }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                      {isOpen && <span style={{ color: 'var(--status-done)', fontSize: 10 }}>▶</span>}
                      <strong style={{ color: 'var(--text-primary)' }}>{project.storeCode}</strong>
                    </div>
                  </td>
                  <td className="status-matrix-phase">{phase || <span style={{ color: 'var(--text-muted)' }}>No report</span>}</td>
                  <td>
                    {noSnapData ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                    ) : (
                      <div className="status-progress-cell">
                        <div className="status-progress-track" aria-hidden="true">
                          <div className={displayProgress > 0 ? 'status-progress-fill' : 'status-progress-zero'} style={{ width: displayProgress > 0 ? `${displayProgress}%` : '100%' }} />
                        </div>
                        <span className="status-progress-value">{displayProgress}%</span>
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
                  <td className="ds-cell-number ds-cell-nowrap" style={{ fontWeight: 700, fontSize: 12, color: dToC }}>
                    {daysToOpening === null ? '—' : daysToOpening < 0 ? `${daysOverdueCount(daysToOpening)}d OVR` : daysToOpening === 0 ? 'Today' : `${daysToOpening}d`}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{reportTag({ latestReport, daysSinceReport, missingReport, reportDueState, scheduleProjectionAvailability })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
