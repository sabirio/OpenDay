import { useState } from 'react';

function changeLabel(phase) {
  if (phase.delta === null || phase.delta === undefined) return '—';
  if (phase.delta > 0) return `+${phase.delta}pp`;
  if (phase.delta < 0) return `${phase.delta}pp`;
  return '0pp';
}

export default function PhaseBoard({ phases, phaseChangeFlags, children }) {
  const [activePhaseId, setActivePhaseId] = useState(null);
  const activePhase = phases.find(phase => phase.id === activePhaseId);

  if (!phases || phases.length === 0) {
    return (
      <div className="dashboard-summary-card weekly-phase-board">
        <div className="weekly-section-kicker">Phase board</div>
        <div className="weekly-phase-empty">No phase data for this report.</div>
      </div>
    );
  }

  return (
    <section className="dashboard-summary-card weekly-phase-board">
      <div className="weekly-phase-board-head">
        <div>
          <div className="weekly-section-kicker">Phase board</div>
          <h2>Phase status matrix</h2>
        </div>
        <span>Click a phase for work package detail</span>
      </div>

      <div className="weekly-phase-table" role="table" aria-label="Phase status matrix">
        <div className="weekly-phase-row weekly-phase-row-head" role="row">
          <span>Phase</span>
          <span>Progress</span>
          <span>Change</span>
          <span>Status</span>
        </div>
        {phases.map(phase => {
          const hasChanges = phaseChangeFlags?.[phase.id];
          const isActive = activePhaseId === phase.id;
          return (
            <button
              key={phase.id}
              type="button"
              className={isActive ? 'weekly-phase-row is-active' : 'weekly-phase-row'}
              onClick={() => setActivePhaseId(isActive ? null : phase.id)}
            >
              <span>
                <strong>{phase.name}</strong>
                {phase.weight != null && <small>{phase.weight}% weight</small>}
              </span>
              <span>{phase.status === 'out_of_scope' ? 'Not in scope' : `${phase.pct}%`}</span>
              <span className={hasChanges ? 'has-change' : ''}>{hasChanges ? changeLabel(phase) : '—'}</span>
              <span className={`weekly-phase-status status-${phase.status}`}>{phase.status.replaceAll('_', ' ')}</span>
            </button>
          );
        })}
      </div>

      {activePhase && (
        <div className="weekly-phase-detail">
          <div>
            <strong>{activePhase.name}</strong>
            <span>{activePhase.status.replaceAll('_', ' ')} · {activePhase.pct}%</span>
          </div>
          {children}
        </div>
      )}
    </section>
  );
}
