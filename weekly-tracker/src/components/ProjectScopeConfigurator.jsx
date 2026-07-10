import { useState } from 'react';
import { WORK_PACKAGES, getPhasesInOrder, getWPsByPhase, getDefaultPhaseWeights } from '../config/masterTaskLibrary';
import { normalizeWeightsTo100, sumWeights, sumsToTarget, WEIGHT_SUM_TARGET } from '../hooks/useProjectScopeModel';
import { fractionToPercent, roundPct } from '../hooks/useChartMathPresentation';

const ALL_PHASE_IDS = getPhasesInOrder().map(p => p.id);
const ALL_WP_IDS    = WORK_PACKAGES.map(wp => wp.id);

const PRESETS = [
  { id: 'standard',  label: 'Standard',    desc: 'All phases including demolition' },
  { id: 'no_demo',   label: 'No Demo',     desc: 'Skip demolition phase' },
  { id: 'custom',    label: 'Custom',      desc: 'Choose phases and work packages manually' },
];

function presetToWPs(preset) {
  if (preset === 'no_demo') return ALL_WP_IDS.filter(id => !id.startsWith('demo.'));
  return ALL_WP_IDS;
}

function presetToPhases(preset) {
  if (preset === 'no_demo') return ALL_PHASE_IDS.filter(id => id !== 'demolition');
  return ALL_PHASE_IDS;
}

export default function ProjectScopeConfigurator({ initialScope, onSave, onClose }) {
  const defaultPreset = initialScope?.preset || 'standard';
  const defaultWPs    = initialScope?.workPackages || presetToWPs(defaultPreset);
  const defaultPhases = initialScope?.phases       || presetToPhases(defaultPreset);

  const [tab, setTab]             = useState('scope');
  const [preset, setPreset]       = useState(defaultPreset);
  const [activeWPs, setActiveWPs] = useState(new Set(defaultWPs));
  const [activePhases, setActivePhases] = useState(new Set(defaultPhases));
  const [weights, setWeights]     = useState(() => ({
    ...getDefaultPhaseWeights(),
    ...(initialScope?.weightOverrides || {}),
  }));

  function applyPreset(p) {
    setPreset(p);
    setActiveWPs(new Set(presetToWPs(p)));
    setActivePhases(new Set(presetToPhases(p)));
  }

  function toggleWP(wpId, phaseId) {
    setActiveWPs(prev => {
      const next = new Set(prev);
      if (next.has(wpId)) next.delete(wpId); else next.add(wpId);
      const phaseWPs = getWPsByPhase(phaseId).map(w => w.id);
      const anyActive = phaseWPs.some(id => (id === wpId ? !prev.has(wpId) : next.has(id)));
      setActivePhases(pp => {
        const np = new Set(pp);
        if (anyActive) np.add(phaseId); else np.delete(phaseId);
        return np;
      });
      return next;
    });
    setPreset('custom');
  }

  function togglePhase(phaseId) {
    const phaseWPs = getWPsByPhase(phaseId).map(w => w.id);
    const isActive = activePhases.has(phaseId);
    setActivePhases(prev => {
      const next = new Set(prev);
      if (isActive) next.delete(phaseId); else next.add(phaseId);
      return next;
    });
    setActiveWPs(prev => {
      const next = new Set(prev);
      if (isActive) phaseWPs.forEach(id => next.delete(id));
      else          phaseWPs.forEach(id => next.add(id));
      return next;
    });
    setPreset('custom');
  }

  const orderedActive = getPhasesInOrder().filter(p => activePhases.has(p.id));
  const activeIds      = orderedActive.map(p => p.id);
  const activeTotal   = sumWeights(activeIds, weights);
  const totalOk       = sumsToTarget(activeTotal, WEIGHT_SUM_TARGET);

  function normalizeWeights() {
    if (activeIds.length === 0) return;
    const normalized = normalizeWeightsTo100(activeIds, weights);
    setWeights(prev => ({ ...prev, ...normalized }));
  }

  function handleSave() {
    if (!totalOk) return;
    onSave({
      preset,
      phases:          [...activePhases],
      workPackages:    [...activeWPs],
      weightOverrides: { ...weights },
    });
  }

  const phases = getPhasesInOrder();

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: tab === id ? '2px solid var(--status-done)' : '2px solid transparent',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: tab === id ? 700 : 500,
        color: tab === id ? 'var(--status-done)' : 'var(--text-muted)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-surface)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', width: '90vw', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Configure Project Scope</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Select which phases and work packages are active for this project</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingLeft: 10, flexShrink: 0 }}>
          {tabBtn('scope', 'Scope')}
          {tabBtn('weights', 'Weights')}
        </div>

        {tab === 'scope' ? (
          <>
            {/* Preset strip */}
            <div style={{ padding: '14px 24px 0', flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Preset</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {PRESETS.map(({ id, label, desc }) => {
                  const active = preset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyPreset(id)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        border: `1.5px solid ${active ? 'var(--status-done)' : 'var(--border)'}`,
                        background: active ? 'var(--status-done-bg)' : 'var(--accent-subtle)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--status-done)' : 'var(--text-primary)' }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phase/WP tree */}
            <div style={{ overflowY: 'auto', padding: '14px 24px', flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
                Work Packages — {activeWPs.size} of {ALL_WP_IDS.length} active
              </div>
              {phases.map(phase => {
                const phaseWPs      = getWPsByPhase(phase.id);
                const phaseActive   = activePhases.has(phase.id);
                const activeCount   = phaseWPs.filter(wp => activeWPs.has(wp.id)).length;
                const indeterminate = phaseActive && activeCount < phaseWPs.length;

                return (
                  <div key={phase.id} style={{ marginBottom: 6, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: phaseActive ? 'var(--status-done-bg)' : 'var(--bg-elevated)', cursor: 'pointer' }}
                      onClick={() => togglePhase(phase.id)}
                    >
                      <input
                        type="checkbox"
                        checked={phaseActive}
                        ref={el => { if (el) el.indeterminate = indeterminate; }}
                        onChange={() => togglePhase(phase.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', width: 15, height: 15 }}
                      />
                      <span style={{ fontWeight: 700, fontSize: 13, color: phaseActive ? 'var(--status-done)' : 'var(--text-primary)', flex: 1 }}>{phase.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeCount}/{phaseWPs.length}</span>
                    </div>
                    {phaseActive && (
                      <div style={{ padding: '6px 14px 8px 36px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {phaseWPs.map(wp => {
                          const wpActive = activeWPs.has(wp.id);
                          return (
                            <label key={wp.id} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={wpActive}
                                onChange={() => toggleWP(wp.id, phase.id)}
                                style={{ cursor: 'pointer', width: 14, height: 14 }}
                              />
                              <span style={{ fontSize: 12, color: wpActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>{wp.label}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{roundPct(fractionToPercent(wp.duration_pct))}%</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Weights tab */
          <div style={{ overflowY: 'auto', padding: '16px 24px', flex: 1 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Phase Weights</span>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
                background: totalOk ? 'var(--status-done-bg)' : 'var(--status-warn-bg)',
                color:      totalOk ? 'var(--status-done)'    : 'var(--status-warn)',
              }}>
                Σ {activeTotal} / {WEIGHT_SUM_TARGET}
              </span>
            </div>

            {/* Phase rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {orderedActive.map(phase => (
                <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{phase.label}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={weights[phase.id] ?? 0}
                    onChange={e => setWeights(w => ({ ...w, [phase.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                    style={{
                      width: 60, fontSize: 13, padding: '3px 8px', textAlign: 'right',
                      border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Normalize button */}
            <button
              onClick={normalizeWeights}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              }}
            >
              Normalize to 100
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {activeWPs.size} work packages · {activePhases.size} phases
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {tab === 'weights' && !totalOk && (
              <span style={{ fontSize: 11, color: 'var(--status-warn)' }}>Weights must sum to 100</span>
            )}
            <button className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" onClick={handleSave} disabled={!totalOk}>Save Scope</button>
          </div>
        </div>
      </div>
    </div>
  );
}
