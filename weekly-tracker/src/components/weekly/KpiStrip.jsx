import { StatusBadge, InfoLabel } from './shared';

export default function KpiStrip({ project, report, overallProgress, portfolioKpis, projectReportCount, onMissingClick }) {
  if (!project) return null;

  const currentPhase = Array.isArray(report?.currentPhases)
    ? report.currentPhases.join(' + ')
    : (report?.currentPhase || '—');

  const kpis = [
    {
      label: 'Overall Progress',
      node: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-done)', lineHeight: 1 }}>{overallProgress}%</span>
          <div style={{ width: 60, background: 'var(--border)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{ width: `${overallProgress}%`, height: '100%', background: 'var(--status-done)', borderRadius: 4 }} />
          </div>
        </div>
      ),
    },
    {
      label: 'Schedule',
      node: <StatusBadge value={report?.projectScheduleStatus} />,
    },
    {
      label: 'Current Phase',
      node: <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{currentPhase}</span>,
    },
    {
      label: 'Construction Start',
      node: <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{project.constructionStartDate || '—'}</span>,
    },
    {
      label: 'Construction End',
      node: <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{project.constructionEndDate || '—'}</span>,
    },
    {
      label: 'Target Opening',
      node: <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--status-warn)' }}>{project.targetOpeningDate || '—'}</span>,
    },
  ];

  return (
    <div className="dashboard-summary-card weekly-kpi-strip">
      <div className="weekly-section-kicker">Report truth</div>
      <div className="weekly-kpi-primary">
        {kpis.map(k => (
          <div key={k.label} className="weekly-kpi-item">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>{k.label}</div>
            {k.node}
          </div>
        ))}
      </div>

      <div className="weekly-kpi-secondary">
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>Report Date</div>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{report?.reportingDate || '—'}</span>
        </div>
        <InfoLabel label="Total Reports">{projectReportCount}</InfoLabel>
        <button
          type="button"
          className="weekly-kpi-missing"
          disabled={portfolioKpis.missingCount <= 0}
          onClick={portfolioKpis.missingCount > 0 ? onMissingClick : undefined}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>Missing Reports</div>
          <span style={{ fontSize: 18, fontWeight: 800, color: portfolioKpis.missingCount > 0 ? 'var(--status-alert)' : 'var(--status-done)', textDecoration: portfolioKpis.missingCount > 0 ? 'underline dotted' : 'none' }}>
            {portfolioKpis.missingCount}
          </span>
        </button>
        <InfoLabel label="Blocked">
          <span style={{ fontWeight: 700, color: report?.activitiesBlocked === 'Yes' ? 'var(--status-alert)' : 'var(--status-done)' }}>
            {report?.activitiesBlocked || '—'}
          </span>
        </InfoLabel>
        <InfoLabel label="Client Support">
          <span style={{ fontWeight: 700, color: report?.supportRequired === 'Yes' ? 'var(--status-warn)' : 'var(--status-done)' }}>
            {report?.supportRequired || '—'}
          </span>
        </InfoLabel>
      </div>
    </div>
  );
}
