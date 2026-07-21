import { useState, useEffect, useMemo } from 'react';
import { setPhaseWeight, setWorkPackageDuration, movePhase, normalizeWeights, computeTemplateWeightSums, validateTemplate, isTemplateValid, countErrors, isWithinEpsilon, WEIGHT_SUM_TARGET } from '../hooks/useTemplateEditorModel.js';
import { fetchActiveTemplate, saveTemplate } from '../data/templatesApi.js';

const EPS = 0.001;

// UI-consistency fix (2026-07-16): borderRadius was a hardcoded 10 instead
// of the shared --radius-lg token every other card-shaped surface in the
// app uses (design-system.css's own .card class, which this hand-rolled
// object otherwise duplicates). This page is currently hidden from nav
// (unwired save path — see App.jsx), so a full inline-style-to-className
// rewrite wasn't attempted here; kept to a token-only fix.
const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '12px 16px',
};

const btnBase = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  padding: '3px 8px',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
};

const inputStyle = {
  fontSize: 12,
  padding: '3px 6px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
};

export default function TemplateEditor({ initialTemplate, onSave, onCancel }) {
  const [draft, setDraft]           = useState(initialTemplate);
  const [templateId, setTemplateId] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | { error: string }
  const [expanded, setExpanded]     = useState({});

  // Auto-clear "Saved" confirmation after 3 s
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = setTimeout(() => setSaveStatus(null), 3000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // Fetch active template on mount; fall back to initialTemplate if fetch fails
  useEffect(() => {
    fetchActiveTemplate().then(fetched => {
      if (fetched) {
        const { id, name: _name, ...templateData } = fetched;
        setTemplateId(id);
        setDraft(templateData);
      }
      setLoading(false);
    });
  }, []);

  const issues = useMemo(() => validateTemplate(draft), [draft]);
  const valid  = useMemo(() => isTemplateValid(draft), [draft]);

  const sortedPhases = useMemo(
    () => [...(draft.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [draft.phases]
  );

  const { weightSum, durSums } = useMemo(
    () => computeTemplateWeightSums({ phases: draft.phases, workPackages: draft.workPackages }),
    [draft.phases, draft.workPackages]
  );

  const wpsByPhase = useMemo(() => {
    const map = {};
    for (const wp of (draft.workPackages ?? [])) {
      if (!map[wp.phaseId]) map[wp.phaseId] = [];
      map[wp.phaseId].push(wp);
    }
    return map;
  }, [draft.workPackages]);

  const errorCount = countErrors(issues);
  const weightOk   = isWithinEpsilon(weightSum, WEIGHT_SUM_TARGET, EPS);
  const canSave    = valid && !!templateId && saveStatus !== 'saving';

  async function handleSave() {
    if (!canSave) return;
    setSaveStatus('saving');
    const result = await saveTemplate(templateId, { phases: draft.phases, workPackages: draft.workPackages });
    if (result.ok) {
      setSaveStatus('saved');
      onSave(draft);
    } else {
      setSaveStatus({ error: result.error ?? 'Save failed' });
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 14 }}>
        Loading template…
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          Template Editor
        </h2>
        <span style={{
          padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
          background: valid ? 'var(--status-done-bg)' : 'var(--status-alert-bg)',
          color:      valid ? 'var(--status-done)'    : 'var(--status-alert)',
        }}>
          {valid ? 'Valid' : `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
        </span>
        {!templateId && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            (no active template in DB — changes cannot be saved)
          </span>
        )}
      </div>

      {/* Weight summary bar */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Σ weight:{' '}
          <strong style={{ color: weightOk ? 'var(--status-done)' : 'var(--status-alert)' }}>
            {weightSum}
          </strong>
          {' '}/ {WEIGHT_SUM_TARGET}
        </span>
        <button
          style={{ ...btnBase, marginLeft: 'auto' }}
          onClick={() => setDraft(normalizeWeights(draft))}
        >
          Normalize
        </button>
      </div>

      {/* Phases list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {sortedPhases.map((phase, i) => {
          const isFirst    = i === 0;
          const isLast     = i === sortedPhases.length - 1;
          const durSum     = durSums[phase.id] || 0;
          const durOk      = isWithinEpsilon(durSum, 1, EPS);
          const phaseWPs   = wpsByPhase[phase.id] || [];
          const isExpanded = !!expanded[phase.id];

          return (
            <div key={phase.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                {/* Move buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button
                    disabled={isFirst}
                    style={{ ...btnBase, padding: '1px 5px', opacity: isFirst ? 0.3 : 1, cursor: isFirst ? 'default' : 'pointer' }}
                    onClick={() => setDraft(movePhase(draft, phase.id, 'up'))}
                  >↑</button>
                  <button
                    disabled={isLast}
                    style={{ ...btnBase, padding: '1px 5px', opacity: isLast ? 0.3 : 1, cursor: isLast ? 'default' : 'pointer' }}
                    onClick={() => setDraft(movePhase(draft, phase.id, 'down'))}
                  >↓</button>
                </div>

                {/* Phase label */}
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {phase.label}
                </span>

                {/* progressWeight input */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                  weight:
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={phase.progressWeight ?? 0}
                    style={{ ...inputStyle, width: 56 }}
                    onChange={e => setDraft(setPhaseWeight(draft, phase.id, Number(e.target.value)))}
                  />
                </label>

                {/* Duration sum */}
                <span style={{ fontSize: 12, color: durOk ? 'var(--text-muted)' : 'var(--status-alert)', flexShrink: 0 }}>
                  Σ dur: {durSum.toFixed(2)}
                </span>

                {/* Expand toggle */}
                {phaseWPs.length > 0 && (
                  <button
                    style={{ ...btnBase, flexShrink: 0 }}
                    onClick={() => setExpanded(prev => ({ ...prev, [phase.id]: !prev[phase.id] }))}
                  >
                    {isExpanded ? '▾' : '▸'} {phaseWPs.length} WPs
                  </button>
                )}
              </div>

              {/* Expanded WP rows */}
              {isExpanded && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {phaseWPs.map((wp, j) => (
                    <div key={wp.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '4px 0',
                      borderBottom: j < phaseWPs.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{wp.label}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        duration_pct:
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={wp.duration_pct ?? 0}
                          style={{ ...inputStyle, width: 68 }}
                          onChange={e => setDraft(setWorkPackageDuration(draft, wp.id, Number(e.target.value)))}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Issues panel */}
      {issues.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Issues ({issues.length})
          </div>
          {issues.map((issue, idx) => (
            <div key={idx} style={{
              display: 'flex', gap: 8, padding: '5px 0',
              borderBottom: idx < issues.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 12, lineHeight: 1.4, alignItems: 'flex-start',
            }}>
              <span style={{
                flexShrink: 0, fontWeight: 700, fontSize: 11, padding: '1px 6px', borderRadius: 4,
                background: issue.severity === 'error' ? 'var(--status-alert-bg)' : 'var(--status-warn-bg)',
                color:      issue.severity === 'error' ? 'var(--status-alert)'    : 'var(--status-warn)',
              }}>
                {issue.severity}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
                {issue.code}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {saveStatus === 'saved' && (
          <span style={{ fontSize: 12, color: 'var(--status-done)', fontWeight: 600 }}>Saved</span>
        )}
        {saveStatus?.error && (
          <span style={{ fontSize: 12, color: 'var(--status-alert)' }}>{saveStatus.error}</span>
        )}
        {saveStatus === 'saving' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving…</span>
        )}
        <button style={{ ...btnBase, padding: '6px 18px' }} onClick={onCancel}>
          Cancel
        </button>
        <button
          disabled={!canSave}
          style={{
            ...btnBase, padding: '6px 18px', fontWeight: 700,
            background: canSave ? 'var(--accent)'       : 'var(--bg-elevated)',
            color:      canSave ? 'var(--text-inverse)' : 'var(--text-muted)',
            border:     canSave ? '1px solid var(--accent)' : '1px solid var(--border)',
            cursor:     canSave ? 'pointer'             : 'default',
            opacity:    canSave ? 1                     : 0.6,
          }}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}
