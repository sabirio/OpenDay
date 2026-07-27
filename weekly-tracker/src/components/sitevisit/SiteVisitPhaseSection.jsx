import { useState, useRef, useEffect, useMemo } from 'react';
import GanttPMTaskRow from './GanttPMTaskRow';
import { buildSiteVisitPhaseSectionModel } from '../../hooks/useSiteVisitWorkflow.js';

const ACCENT = 'var(--field-accent-sitevisit)';

// Collapsible phase wrapper — mirrors Contractor Report's PhaseSection
// (components/contractor/GanttWPSection.jsx): same dot+chevron+header,
// auto-collapse once the phase reaches 100%, per-project localStorage
// persistence. GanttPMTaskRow (status/progress/discrepancy/GC-reference
// behavior) is reused unchanged as the row renderer — only the collapsible
// shell is Site-Visit-specific, since Contractor's row has no discrepancy
// or GC-reference concept to preserve.
//
// `tasks` is the currently filtered/visible subset of this phase's tasks
// (what gets rendered); `allPhaseTasks` is the phase's full, unfiltered
// task set (what the header % is computed from) — so switching the
// "incomplete"/"discrepant" filter narrows the visible rows without making
// the phase's own completion percentage look wrong.
export default function SiteVisitPhaseSection({ phaseKey, tasks, allPhaseTasks, pmWpObservations, updatePMObservation, projectId }) {
  const storageKey = `sitevisit_phases_${projectId}`;

  const { phasePct, allComplete } = useMemo(
    () => buildSiteVisitPhaseSectionModel(allPhaseTasks, pmWpObservations),
    [allPhaseTasks, pmWpObservations]
  );

  // Unlike Contractor's form (blank until filled, so it starts collapsed),
  // Site Visit is a review flow — a phase starts OPEN so the PM sees it,
  // unless it's already fully complete (nothing to review) or the PM
  // explicitly closed it themselves last time.
  const [open, setOpen] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (phaseKey in stored) return stored[phaseKey];
    } catch { /* ignore corrupt localStorage */ }
    return !allComplete;
  });

  function toggle(next = !open) {
    setOpen(next);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      stored[phaseKey] = next;
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch { /* ignore corrupt localStorage */ }
  }

  // Auto-close the moment the phase becomes fully complete during this
  // session (skip on first mount — the initializer above already accounts
  // for an already-complete phase at load time).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (allComplete && open) toggle(false);
  }, [allComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const pctColor = phasePct >= 100 ? 'var(--field-success-fg)' : phasePct >= 50 ? ACCENT : 'var(--field-text-secondary)';

  return (
    <div style={{ background: 'var(--field-bg-card)', border: '1px solid var(--field-border)', borderRadius: 14, marginBottom: 14, overflow: 'hidden', boxShadow: 'var(--field-shadow)' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-testid="site-visit-phase-header"
        onClick={() => toggle()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        style={{
          padding: '12px 22px',
          borderBottom: open ? '1px solid var(--field-bg-subtle)' : 'none',
          background: 'var(--field-bg-faint)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
          <span style={{
            fontSize: 10, color: 'var(--field-text-secondary)', display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--field-text-heading)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {phaseKey}
          </h3>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: pctColor }}>{phasePct}%</span>
      </div>

      {open && (
        <div style={{ padding: '4px 22px 8px' }}>
          {tasks.map(task => (
            <GanttPMTaskRow key={task.id} task={task} pmEntry={pmWpObservations[task.id]} onChange={updates => updatePMObservation(task.id, updates)} />
          ))}
        </div>
      )}
    </div>
  );
}
