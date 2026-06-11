// Collapsible summary of the previous report — shown above the current report detail.
import { useState } from 'react';
import { statusColor } from './sharedUtils';

export default function PrevReportSummary({ prevReport, formatDate, WORK_PACKAGES, isWPReport, deriveWPStatusesFromOldReport }) {
  const [open, setOpen] = useState(false);
  if (!prevReport) return null;

  const date       = prevReport.reportingDate || formatDate(prevReport.submittedAt);
  const wpStatuses = isWPReport(prevReport)
    ? prevReport.workPackageStatuses
    : deriveWPStatusesFromOldReport(prevReport);

  const activeWPs = WORK_PACKAGES.filter(wp => {
    const pkg = wpStatuses?.[wp.id] || {};
    return Object.values(pkg).some(e => e?.status && e.status !== 'Not Started');
  });

  const phases = Array.isArray(prevReport.currentPackages)
    ? prevReport.currentPackages
    : Array.isArray(prevReport.currentPhases)
      ? prevReport.currentPhases
      : prevReport.currentPhase
        ? [prevReport.currentPhase]
        : [];

  const sc = prevReport.projectScheduleStatus;
  const scColor = sc === 'On Track' ? { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
                : sc === 'Delayed'  ? { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
                : { bg: '#fffbeb', color: '#d97706', border: '#fde68a' };

  return (
    <div style={{ marginBottom: 14, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#ffffff' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Previous Report</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{date}</span>
          {sc && (
            <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: scColor.bg, color: scColor.color, border: `1px solid ${scColor.border}` }}>
              {sc}
            </span>
          )}
          {phases.length > 0 && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{phases.join(' · ')}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 18px 16px' }}>
          {activeWPs.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>No work package statuses recorded in this report.</div>
          ) : (
            activeWPs.map(wp => {
              const pkg = wpStatuses[wp.id] || {};
              const filledTasks = wp.tasks.filter(t => pkg[t.name]?.status && pkg[t.name].status !== 'Not Started');
              if (!filledTasks.length) return null;
              return (
                <div key={wp.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{wp.name}</div>
                  {filledTasks.map(task => {
                    const entry  = pkg[task.name];
                    const status = entry?.status || 'Not Started';
                    const tc     = statusColor(status);
                    return (
                      <div key={task.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: 12, color: '#6b7280', flex: 1, paddingRight: 12, lineHeight: 1.35 }}>{task.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {entry?.progress > 0 && <span style={{ fontSize: 11, color: '#6b7280' }}>{entry.progress}%</span>}
                          <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: tc + '20', color: tc, border: `1px solid ${tc}44`, whiteSpace: 'nowrap' }}>{status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
          {prevReport.nextWeekTop3 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Top 3 planned (from that report)</div>
              <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{prevReport.nextWeekTop3}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
