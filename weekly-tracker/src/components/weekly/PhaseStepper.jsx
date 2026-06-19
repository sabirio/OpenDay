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

const SHORT_NAME = name =>
  name
    .replace('Pre-construction', 'Pre-con')
    .replace('Demolition & Preparation', 'Demo')
    .replace('Finishes & Final Installation', 'Finishes')
    .replace('Fixtures & Equipment', 'Equipment')
    .replace('Testing & Commissioning', 'T&C')
    .replace('Snagging & Handover', 'Handover')
    .replace('MEP Rough-in', 'MEP');

function PhaseCard({ wp, pct, isSelected, onClick, hasChanges }) {
  const isDone      = pct === 100;
  const hasProgress = pct > 0 && pct < 100;

  const cardStyle = isDone ? {
    border: '2px solid var(--status-warn)',
    background: 'var(--status-warn-bg)',
    color: 'var(--status-warn)',
    boxShadow: '0 0 12px rgba(249,115,22,0.2)',
  } : hasProgress ? {
    border: '2px solid #888',
    background: 'var(--bg-elevated)',
    color: '#ccc',
    boxShadow: 'none',
  } : {
    border: '2px solid #333',
    background: 'var(--bg-elevated)',
    color: '#555',
    boxShadow: 'none',
  };

  const labelColor = isDone ? 'var(--status-warn)' : hasProgress ? '#aaa' : '#444';

  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '1 1 0', cursor: 'pointer', minWidth: 64 }}
    >
      {/* Wrapper gives the dot a clipping context outside the overflow:hidden card */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 10,
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          outline: isSelected ? '2px solid var(--text-primary)' : 'none',
          outlineOffset: 2,
          transition: 'all 0.15s',
          ...cardStyle,
        }}>
          {/* Fill overlay for in-progress state */}
          {hasProgress && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: `${pct}%`,
              background: '#ffffff0a',
              borderTop: '1px solid #ffffff15',
            }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, position: 'relative', zIndex: 1 }}>
            {pct}%
          </span>
          {isDone && (
            <span style={{ fontSize: 10, lineHeight: 1, position: 'relative', zIndex: 1 }}>✓</span>
          )}
        </div>

        {/* "Changed this week" dot — only when a WP in this phase has a positive delta */}
        {hasChanges && (
          <div style={{
            position: 'absolute', top: -3, right: -3,
            width: 9, height: 9, borderRadius: '50%',
            background: 'var(--status-done)',
            border: '1.5px solid var(--bg-surface)',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      <div style={{
        fontSize: 11, color: labelColor, textAlign: 'center',
        maxWidth: 70, lineHeight: 1.3,
        fontWeight: isSelected ? 700 : 500,
      }}>
        {SHORT_NAME(wp.name)}
      </div>
    </div>
  );
}

function DeltaIndicator({ d }) {
  if (!d) return null;
  if (d.isNew)    return <span style={{ fontSize: 10, color: 'var(--text-muted)',  flexShrink: 0 }}>● new</span>;
  if (d.delta > 0) return <span style={{ fontSize: 10, color: 'var(--status-done)', flexShrink: 0, fontWeight: 600 }}>▲ +{d.delta}pp</span>;
  if (d.delta < 0) return <span style={{ fontSize: 10, color: 'var(--status-warn)', flexShrink: 0, fontWeight: 600 }}>▼ {d.delta}pp</span>;
  return                   <span style={{ fontSize: 10, color: 'var(--text-muted)',  flexShrink: 0 }}>—</span>;
}

export default function PhaseStepper({ workPackages, mergedStatuses, reportKey, wpDeltas, phaseChangeFlags }) {
  const [activeId, setActiveId] = useState(null);
  const activeWP = workPackages.find(wp => wp.id === activeId);

  return (
    <div key={reportKey} style={{ marginBottom: 20 }}>
      {/* Phase cards rail */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', gap: 4 }}>
          {workPackages.map(wp => {
            const pct = wpProgress(wp, mergedStatuses);
            return (
              <PhaseCard
                key={wp.id}
                wp={wp}
                pct={pct}
                isSelected={wp.id === activeId}
                onClick={() => setActiveId(activeId === wp.id ? null : wp.id)}
                hasChanges={phaseChangeFlags?.[wp.id] ?? false}
              />
            );
          })}
        </div>
      </div>

      {/* Expanded task detail panel */}
      {activeWP && (
        <div style={{ marginTop: 4, background: 'var(--bg-elevated)', borderRadius: 14, padding: '14px 20px' }}>
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
                    const delta  = wpDeltas?.[activeWP.id]?.[taskName];
                    return (
                      <div key={taskName} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, color: tc, fontWeight: 700, width: 14, textAlign: 'center', flexShrink: 0 }}>{lbl}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, lineHeight: 1.3 }}>{taskName}</span>
                        {entry.progress > 0 && entry.progress < 100 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{entry.progress}%</span>
                        )}
                        <DeltaIndicator d={wpDeltas ? delta : null} />
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
