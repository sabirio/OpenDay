import { LineChart, SchedBadge } from './DashboardWidgets';
import { formatDate } from '../../utils/reportUtils';
import { SPI_STATUS } from '../../config/statusColors';

/**
 * @param {{ project, latestReport, progress, color, progressPoints, projReports, onSelect, metrics? }} props
 * metrics — optional gantt metrics: { spi, spiStatus, criticalHealth, lastVisitDate, taskCount }
 */
export default function ProjectCard({ project, latestReport, progress, color, progressPoints, projReports, onSelect, metrics }) {
  const today      = new Date();
  const visitDays  = metrics?.lastVisitDate
    ? Math.floor((today - new Date(metrics.lastVisitDate)) / 86400000)
    : null;
  const visitOverdue = visitDays !== null && visitDays > 14;

  return (
    <div onClick={() => onSelect(String(project.id))} style={{ background: 'rgba(31,41,55,0.6)', borderRadius: 12, border: '1px solid #374151', padding: '18px 20px', borderTop: `3px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.4)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#f9fafb' }}>{project.storeCode}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{project.shoppingMallName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{progress}%</div>
          <div style={{ marginTop: 3 }}><SchedBadge status={latestReport?.projectScheduleStatus} /></div>
        </div>
      </div>
      <div style={{ background: '#374151', borderRadius: 3, height: 5, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <LineChart points={progressPoints} width={280} height={70} color={color} />

      {/* SPI badge + visit info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {metrics?.spi != null ? (() => {
          const st = SPI_STATUS[metrics.spiStatus];
          return (
            <span style={{ background: st.bg, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, border: `1px solid ${st.border}` }}>
              SPI {metrics.spi.toFixed(2)} · {st.label}
            </span>
          );
        })() : metrics?.taskCount > 0 ? (
          <span style={{ color: '#9ca3af', fontSize: 11 }}>SPI computing…</span>
        ) : null}

        {visitDays !== null && (
          <span style={{ fontSize: 11, color: visitOverdue ? '#ef4444' : '#6b7280' }}>
            {visitOverdue ? '⚠ ' : ''}Visit {visitDays}d ago
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
        {projReports.length} report{projReports.length !== 1 ? 's' : ''} · latest {latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : 'none'}
      </div>
    </div>
  );
}
