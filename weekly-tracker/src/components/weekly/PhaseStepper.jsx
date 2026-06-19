import { useState } from 'react';
import { WP_STATUS_SCORES, getWPGroups } from '../../config/workPackages';
import { statusColor, statusStyles, deriveOverallStatus } from './sharedUtils';

function wpProgress(wp, mergedStatuses) {
  const taskMap = mergedStatuses?.[wp.id] || {};
  let totalWeight = 0, weightedScore = 0;
  for (const task of wp.tasks) {
    const entry = taskMap[task.name];
    if (!entry) continue;
    const score = WP_STATUS_SCORES[entry.status];
    if (score == null) continue;
    const eff = entry.progress > 0 ? entry.progress / 100 : score;
    totalWeight += task.weight ?? 1;
    weightedScore += (task.weight ?? 1) * eff;
  }
  return totalWeight === 0 ? 0 : Math.round((weightedScore / totalWeight) * 100);
}

function wpOverallStatus(wp, mergedStatuses) {
  const taskMap = mergedStatuses?.[wp.id] || {};
  const statuses = wp.tasks.map(t => taskMap[t.name]?.status || 'Not Started');
  return deriveOverallStatus(statuses);
}

export default function PhaseStepper({ workPackages, mergedStatuses, reportKey }) {
  const [activeId, setActiveId] = useState(null);

  const activeWP = workPackages.find(wp => wp.id === activeId);

  return (
    <div key={reportKey} style={{ marginBottom: 20 }}>
      {/* Stepper rail */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', gap: 0 }}>
          {workPackages.map((wp, i) => {
            const pct     = wpProgress(wp, mergedStatuses);
            const status  = wpOverallStatus(wp, mergedStatuses);
            const color   = statusColor(status);
            const styles  = statusStyles(status);
            const isActive = wp.id === activeId;
            const isLast  = i === workPackages.length - 1;

            return (
              <div key={wp.id} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? '0 0 auto' : '1 1 0', minWidth: 80 }}>
                <div
                  onClick={() => setActiveId(isActive ? null : wp.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '0 4px', minWidth: 72 }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? color : styles.bg,
                    border: `2px solid ${color}`,
                    fontSize: 11, fontWeight: 700,
                    color: isActive ? 'var(--text-inverse)' : color,
                    transition: 'all 0.15s',
                  }}>
                    {pct}%
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    textAlign: 'center', lineHeight: 1.3, maxWidth: 68, wordBreak: 'break-word',
                  }}>
                    {wp.name.replace('Pre-construction', 'Pre-con').replace('Demolition & Preparation', 'Demo').replace('Finishes & Final Installation', 'Finishes').replace('Fixtures & Equipment', 'Equipment').replace('Testing & Commissioning', 'T&C').replace('Snagging & Handover', 'Handover').replace('MEP Rough-in', 'MEP')}
                  </div>
                </div>

                {!isLast && (
                  <div style={{ flex: 1, height: 2, background: 'var(--border)', marginTop: 15, minWidth: 8 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded task detail panel */}
      {activeWP && (
        <div style={{ marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 20px', boxShadow: 'var(--shadow)', borderTop: `3px solid ${statusColor(wpOverallStatus(activeWP, mergedStatuses))}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{activeWP.name}</span>
            <button type="button" onClick={() => setActiveId(null)} style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--accent-subtle)', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>Close ×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {(activeWP.groups ?? getWPGroups(activeWP.id)).map(group => {
              const groupTaskNames = group.tasks;
              return (
                <div key={group.id}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, paddingBottom: 2, borderBottom: '1px solid var(--border)' }}>
                    {group.name}
                  </div>
                  {groupTaskNames.map(taskName => {
                    const entry  = mergedStatuses?.[activeWP.id]?.[taskName] || {};
                    const status = entry.status || 'Not Started';
                    const tc     = statusColor(status);
                    const ts     = statusStyles(status);
                    const score  = WP_STATUS_SCORES[status] ?? 0;
                    const lbl    = score >= 1 ? '✓' : score >= 0.5 ? '▶' : score >= 0.3 ? '⚠' : '·';
                    return (
                      <div key={taskName} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, color: tc, fontWeight: 700, width: 14, textAlign: 'center', flexShrink: 0 }}>{lbl}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, lineHeight: 1.3 }}>{taskName}</span>
                        {entry.progress > 0 && entry.progress < 100 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{entry.progress}%</span>
                        )}
                        <span style={{ padding: '2px 7px', borderRadius: 7, fontSize: 10, fontWeight: 600, background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`, flexShrink: 0 }}>
                          {status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
