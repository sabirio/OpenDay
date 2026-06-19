import { useState } from 'react';
import { statusStyles } from './sharedUtils';

const SC_STYLES = {
  'On Track': { bg: 'var(--status-done-bg)',  color: 'var(--status-done)',  border: 'var(--border)' },
  'Delayed':  { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: 'var(--border)' },
  'At Risk':  { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn)',  border: 'var(--border)' },
  'Critical': { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: 'var(--border)' },
};
const SC_FALLBACK = { bg: 'var(--status-warn-bg)', color: 'var(--status-warn)', border: 'var(--border)' };

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
  const scColor = SC_STYLES[sc] ?? SC_FALLBACK;

  return (
    <div style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-warn)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Previous Report</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{date}</span>
          {sc && (
            <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: scColor.bg, color: scColor.color, border: `1px solid ${scColor.border}` }}>
              {sc}
            </span>
          )}
          {phases.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{phases.join(' · ')}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px 16px' }}>
          {activeWPs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No work package statuses recorded in this report.</div>
          ) : (
            activeWPs.map(wp => {
              const pkg = wpStatuses[wp.id] || {};
              const filledTasks = wp.tasks.filter(t => pkg[t.name]?.status && pkg[t.name].status !== 'Not Started');
              if (!filledTasks.length) return null;
              return (
                <div key={wp.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-warn)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{wp.name}</div>
                  {filledTasks.map(task => {
                    const entry  = pkg[task.name];
                    const status = entry?.status || 'Not Started';
                    const ts     = statusStyles(status);
                    return (
                      <div key={task.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, paddingRight: 12, lineHeight: 1.35 }}>{task.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {entry?.progress > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.progress}%</span>}
                          <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`, whiteSpace: 'nowrap' }}>{status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
          {prevReport.nextWeekTop3 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Top 3 planned (from that report)</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{prevReport.nextWeekTop3}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
