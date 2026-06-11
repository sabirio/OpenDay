// 5 primary KPIs + expandable "More details" row.
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
          <span style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{overallProgress}%</span>
          <div style={{ width: 60, background: '#d1fae5', borderRadius: 4, height: 5, overflow: 'hidden' }}>
            <div style={{ width: `${overallProgress}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
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
      node: <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{currentPhase}</span>,
    },
    {
      label: 'Report Date',
      node: <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{report?.reportingDate || '—'}</span>,
    },
    {
      label: 'Target Opening',
      node: <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316' }}>{project.targetOpeningDate || '—'}</span>,
    },
  ];

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 16, padding: '14px 20px' }}>
      {/* Primary KPIs */}
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
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: open ? '#fff7ed' : '#f9fafb', color: open ? '#f97316' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end', flexShrink: 0 }}
        >
          {open ? 'Less ▲' : 'More ▼'}
        </button>
      </div>

      {/* Expandable details */}
      {open && (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid #f3f4f6' }}>
          <InfoLabel label="Construction Start">{project.constructionStartDate || '—'}</InfoLabel>
          <InfoLabel label="Construction End">{project.constructionEndDate || '—'}</InfoLabel>
          <InfoLabel label="Total Reports">{projectReportCount}</InfoLabel>
          <div style={{ cursor: portfolioKpis.missingCount > 0 ? 'pointer' : 'default' }} onClick={portfolioKpis.missingCount > 0 ? onMissingClick : undefined}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 5 }}>Missing Reports</div>
            <span style={{ fontSize: 18, fontWeight: 800, color: portfolioKpis.missingCount > 0 ? '#dc2626' : '#22c55e', textDecoration: portfolioKpis.missingCount > 0 ? 'underline dotted' : 'none' }}>
              {portfolioKpis.missingCount}
            </span>
          </div>
          <InfoLabel label="Blocked">
            <span style={{ fontWeight: 700, color: report?.activitiesBlocked === 'Yes' ? '#dc2626' : '#22c55e' }}>
              {report?.activitiesBlocked || '—'}
            </span>
          </InfoLabel>
          <InfoLabel label="Client Support">
            <span style={{ fontWeight: 700, color: report?.supportRequired === 'Yes' ? '#d97706' : '#22c55e' }}>
              {report?.supportRequired || '—'}
            </span>
          </InfoLabel>
        </div>
      )}
    </div>
  );
}
