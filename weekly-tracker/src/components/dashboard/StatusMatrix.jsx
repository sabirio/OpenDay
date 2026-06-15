import { formatDate } from '../../utils/reportUtils';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

const T = {
  textPri:   '#f9fafb',
  textBody:  '#e5e7eb',
  textSec:   '#9ca3af',
  textMuted: '#6b7280',
  border:    '#374151',
};

function currentPhaseLabel(row) {
  const { cumulativeStatuses, latestReport } = row;
  return cumulativeStatuses?.currentPhase || (Array.isArray(latestReport?.currentPhases) ? latestReport.currentPhases.join(' + ') : latestReport?.currentPhase);
}

function reportTag({ latestReport, daysSinceReport }) {
  if (!latestReport)     return <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Missing</span>;
  if (daysSinceReport === 0) return <span style={{ fontSize: 11, color: '#10b981' }}>Today</span>;
  if (daysSinceReport <= 7)  return <span style={{ fontSize: 11, color: '#10b981' }}>{daysSinceReport}d ago</span>;
  if (daysSinceReport <= 14) return <span style={{ fontSize: 11, color: '#f97316' }}>{daysSinceReport}d ago</span>;
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Overdue {daysSinceReport}d</span>;
}

export default function StatusMatrix({ rows, alerts, drawerProjectId, onSelect }) {
  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, color: T.textPri, margin: 0 }}>Project Status Matrix</h2>
        <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>Sorted by priority · click row to open project</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="dashboard-table" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th>Store Code</th>
              <th>Current Phase</th><th>Progress</th><th>Schedule</th><th>Risk Level</th>
              <th>Blockers</th><th>Support Required</th><th>Alert</th>
              <th>Target Opening</th><th>Days Left</th><th>Latest Report</th><th>Report Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="12" style={{ color: T.textSec, textAlign: 'center', padding: '24px 0' }}>No matching projects.</td></tr>
            ) : rows.map((row) => {
              const { project, latestReport, progress, color, daysToOpening, daysSinceReport, riskLevel, missingReport } = row;
              const phase      = currentPhaseLabel(row);
              const schedStatus = latestReport?.projectScheduleStatus;
              const isOpen     = drawerProjectId === String(project.id);
              const progColor  = progress >= 75 ? '#10b981' : progress >= 40 ? '#22d3ee' : '#f97316';
              const dToC       = daysToOpening === null ? '#9ca3af' : daysToOpening < 0 ? '#ef4444' : daysToOpening < 30 ? '#ef4444' : daysToOpening < 90 ? '#f97316' : '#10b981';
              return (
                <tr key={project.id} data-testid="dashboard-project-row" data-project-id={String(project.id)} onClick={() => onSelect(String(project.id))} style={{ cursor: 'pointer', background: isOpen ? 'rgba(16,185,129,0.08)' : undefined, transition: 'background 0.15s' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                      {isOpen && <span style={{ color: '#10b981', fontSize: 10 }}>▶</span>}
                      <strong style={{ color: T.textPri }}>{project.storeCode}</strong>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: T.textBody }}>{phase || <span style={{ color: T.textSec }}>No report</span>}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 48, background: T.border, borderRadius: 3, height: 6, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: progColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.textBody, minWidth: 28 }}>{progress}%</span>
                    </div>
                  </td>
                  <td><SchedBadge status={schedStatus} /></td>
                  <td><RiskBadge level={riskLevel} /></td>
                  <td>{latestReport?.activitiesBlocked ? <span style={{ fontSize: 12, fontWeight: 700, color: latestReport.activitiesBlocked === 'Yes' ? '#ef4444' : '#10b981' }}>{latestReport.activitiesBlocked}</span> : <span style={{ color: T.textSec }}>—</span>}</td>
                  <td>{latestReport?.supportRequired ? <span style={{ fontSize: 12, fontWeight: 700, color: latestReport.supportRequired === 'Yes' ? '#f97316' : '#10b981' }}>{latestReport.supportRequired}</span> : <span style={{ color: T.textSec }}>—</span>}</td>
                  <td>{alerts.some(a => String(a.pid) === String(project.id)) ? <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}>Yes</span> : <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>No</span>}</td>
                  <td style={{ fontSize: 12, fontWeight: 600, color: dToC, whiteSpace: 'nowrap' }}>{project.targetOpeningDate ? formatDate(project.targetOpeningDate) : <span style={{ color: T.textSec }}>—</span>}</td>
                  <td style={{ fontWeight: 700, fontSize: 12, color: dToC, whiteSpace: 'nowrap' }}>
                    {daysToOpening === null ? '—' : daysToOpening < 0 ? `${Math.abs(daysToOpening)}d OVR` : daysToOpening === 0 ? 'Today' : `${daysToOpening}d`}
                  </td>
                  <td style={{ fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: T.textSec }}>—</span>}</td>
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
