import { useState } from 'react';
import { StatusBadge, InfoLabel } from './shared';

export default function KpiStrip({ project, report, overallProgress, portfolioKpis, projectReportCount, onMissingClick }) {
  const [open, setOpen] = useState(false);
  if (!project) return null;

  const currentPhase = Array.isArray(report?.currentPhases)
    ? report.currentPhases.join(' + ')
    : (report?.currentPhase || '—');

  const kpis = [
    {
      label: 'Overall Progress',
      node: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{overallProgress}%</span>
          <div style={{ width: 60, background: '#374151', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{ width: `${overallProgress}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
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
      node: <span style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{currentPhase}</span>,
    },
    {
      label: 'Report Date',
      node: <span style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{report?.reportingDate || '—'}</span>,
    },
    {
      label: 'Target Opening',
      node: <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>{project.targetOpeningDate || '—'}</span>,
    },
  ];

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 16, padding: '14px 20px' }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: open ? 16 : 0 }}>
        {kpis.map(k => (
          <div key={k.label}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 }}>{k.label}</div>
            {k.node}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 8, border: '1px solid #374151', background: open ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.04)', color: open ? '#f97316' : '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end', flexShrink: 0 }}
        >
          {open ? 'Less ▲' : 'More ▼'}
        </button>
      </div>

      {open && (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid #374151' }}>
          <InfoLabel label="Construction Start">{project.constructionStartDate || '—'}</InfoLabel>
          <InfoLabel label="Construction End">{project.constructionEndDate || '—'}</InfoLabel>
          <InfoLabel label="Total Reports">{projectReportCount}</InfoLabel>
          <div style={{ cursor: portfolioKpis.missingCount > 0 ? 'pointer' : 'default' }} onClick={portfolioKpis.missingCount > 0 ? onMissingClick : undefined}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 5 }}>Missing Reports</div>
            <span style={{ fontSize: 18, fontWeight: 800, color: portfolioKpis.missingCount > 0 ? '#ef4444' : '#10b981', textDecoration: portfolioKpis.missingCount > 0 ? 'underline dotted' : 'none' }}>
              {portfolioKpis.missingCount}
            </span>
          </div>
          <InfoLabel label="Blocked">
            <span style={{ fontWeight: 700, color: report?.activitiesBlocked === 'Yes' ? '#ef4444' : '#10b981' }}>
              {report?.activitiesBlocked || '—'}
            </span>
          </InfoLabel>
          <InfoLabel label="Client Support">
            <span style={{ fontWeight: 700, color: report?.supportRequired === 'Yes' ? '#f97316' : '#10b981' }}>
              {report?.supportRequired || '—'}
            </span>
          </InfoLabel>
        </div>
      )}
    </div>
  );
}
