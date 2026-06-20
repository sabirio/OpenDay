import { useState, useEffect, useMemo } from 'react';
import { fetchActiveTemplate, fetchTemplateById } from '../data/templatesApi';
import { computeEffectiveWeights, validateTemplate } from '../core/projects';
import { constructionRetailV1 } from '../domains/construction/templates/constructionRetailV1';
import { WORK_PACKAGES as GANTT_WPS } from '../config/masterTaskLibrary';

// Domain label maps — resolved once at module load, never in core
const PHASE_LABELS = Object.fromEntries(
  constructionRetailV1.phases.map(p => [p.id, p.label])
);
const WP_LABELS = Object.fromEntries(
  constructionRetailV1.phases.flatMap(ph =>
    (ph.workPackages || []).map(wp => [wp.id, wp.label])
  )
);

// ── Build display model — zero new math, assembles from core fns ──────────────
function buildAudit(template, scopeWPIds) {
  if (!template) return null;

  const phases = template.phases ?? [];
  const wps    = template.workPackages ?? [];

  const phaseWeights    = Object.fromEntries(phases.map(p => [p.id, p.progressWeight ?? 0]));
  const effectiveWeights = computeEffectiveWeights(wps, scopeWPIds, phaseWeights);
  const effectiveSum     = Object.values(effectiveWeights).reduce((s, w) => s + w, 0);

  const totalPW    = phases.reduce((s, p) => s + (p.progressWeight ?? 0), 0);
  const inScopeSet = scopeWPIds ? new Set(scopeWPIds) : null;

  const phaseModels = phases.map(phase => {
    const phaseWPs   = wps.filter(wp => wp.phaseId === phase.id);
    const phaseWPSum = phaseWPs.reduce((s, wp) => s + (wp.duration_pct ?? 0), 0);
    const pw         = phase.progressWeight ?? 0;

    return {
      id:                 phase.id,
      label:              PHASE_LABELS[phase.id] ?? phase.id,
      progressWeight:     pw,
      progressWeightPct:  totalPW > 0 ? (pw / totalPW) * 100 : 0,
      wps: phaseWPs.map(wp => ({
        id:               wp.id,
        label:            WP_LABELS[wp.id] ?? wp.id,
        duration_pct:     wp.duration_pct ?? 0,
        durationPctInPhase: phaseWPSum > 0 ? (wp.duration_pct ?? 0) / phaseWPSum : 0,
        effectiveWeight:  effectiveWeights[wp.id] ?? 0,
        inScope:          inScopeSet ? inScopeSet.has(wp.id) : true,
      })),
    };
  });

  const inEffective  = new Set(Object.keys(effectiveWeights));
  const excludedWPs  = wps
    .filter(wp => !inEffective.has(wp.id))
    .map(wp => ({ id: wp.id, label: WP_LABELS[wp.id] ?? wp.id }));

  return {
    templateMeta: {
      name:     template.name     ?? '(unnamed)',
      familyId: template.familyId ?? null,
      version:  template.version  ?? null,
    },
    validation: validateTemplate(template),
    effectiveSum,
    phases:     phaseModels,
    excludedWPs,
  };
}

// ── Tiny shared primitives ────────────────────────────────────────────────────
function MiniBar({ pct, color = 'var(--accent)', width = 72, height = 4 }) {
  return (
    <div style={{ width, background: 'var(--border)', borderRadius: 3, height, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
    </div>
  );
}

function Badge({ children, color = 'var(--text-muted)', bg = 'var(--bg-elevated)' }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
      background: bg, color, border: '1px solid var(--border)',
    }}>
      {children}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WeightAudit({ projects }) {
  const [mode,              setMode]              = useState('project');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [template,          setTemplate]          = useState(null);
  const [loading,           setLoading]           = useState(false);

  const selectedProject = projects.find(p => String(p.id) === selectedProjectId) ?? null;

  // Mirror WeeklyReports scopeWPIds derivation exactly so the audit matches the engine
  const scopeWPIds = useMemo(() => {
    if (mode !== 'project' || !selectedProject) return null;
    const s = selectedProject.scope ?? null;
    if (!s) return null;
    return GANTT_WPS
      .filter(wp => (!s.phases?.length    || s.phases.includes(wp.phaseId))
                 && (!s.workPackages?.length || s.workPackages.includes(wp.id)))
      .map(wp => wp.id);
  }, [mode, selectedProject]);

  useEffect(() => {
    let alive = true;
    setTemplate(null);
    if (mode === 'template') {
      setLoading(true);
      fetchActiveTemplate().then(t => { if (alive) { setTemplate(t); setLoading(false); } });
    } else if (selectedProject?.templateId) {
      setLoading(true);
      fetchTemplateById(selectedProject.templateId)
        .then(t => { if (alive) { setTemplate(t); setLoading(false); } });
    } else {
      setLoading(false);
    }
    return () => { alive = false; };
  }, [mode, selectedProject?.id, selectedProject?.templateId]);

  const auditModel = useMemo(() => buildAudit(template, scopeWPIds), [template, scopeWPIds]);

  const pinnedProjects = projects.filter(p => p.templateId);
  const errors         = auditModel?.validation.filter(i => i.severity === 'error')   ?? [];
  const warnings       = auditModel?.validation.filter(i => i.severity === 'warning') ?? [];
  const isValid        = errors.length === 0;
  const sumOk          = auditModel ? Math.abs(auditModel.effectiveSum - 1) <= 0.001 : true;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Weight Audit</h1>
          <p>Inspect how template weights and work-package durations roll up into effective weights.</p>
        </div>
      </div>

      {/* Mode + picker toolbar */}
      <div className="dashboard-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['project', 'Project'], ['template', 'Active Template']].map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${mode === id ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === id ? 'var(--accent)' : 'transparent',
              color: mode === id ? 'var(--bg-surface)' : 'var(--text-muted)',
            }}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'project' && (
          <div className="dashboard-filter-group">
            <label>Project</label>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}>
              <option value="">— select project —</option>
              {pinnedProjects.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.storeCode} — {p.shoppingMallName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Empty / loading states */}
      {loading && (
        <div className="dashboard-summary-card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
          Loading template…
        </div>
      )}
      {!loading && mode === 'project' && !selectedProject && (
        <div className="dashboard-summary-card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '48px 0', fontSize: 14 }}>
          Select a project to inspect its pinned template weights.
        </div>
      )}
      {!loading && mode === 'project' && selectedProject && !selectedProject.templateId && (
        <div className="dashboard-summary-card" style={{ color: 'var(--status-warn)', fontSize: 13 }}>
          This project has no pinned template — it uses built-in default weights and appears
          identical to the full-scope view of the active template.
        </div>
      )}

      {/* ── Audit panel ──────────────────────────────────────────────────────── */}
      {!loading && auditModel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Template meta + validation + sum */}
          <div className="dashboard-summary-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                {auditModel.templateMeta.name}
              </span>
              {auditModel.templateMeta.version != null && (
                <Badge color="var(--accent)" bg="var(--accent-subtle)">v{auditModel.templateMeta.version}</Badge>
              )}
              {mode === 'template' && (
                <Badge color="var(--status-done)" bg="var(--status-done-bg)">Active</Badge>
              )}
              {mode === 'project' && selectedProject && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Pinned to {selectedProject.storeCode} — {selectedProject.shoppingMallName}
                  {scopeWPIds && ` · ${scopeWPIds.length} WPs in scope`}
                </span>
              )}
            </div>

            {/* Validation + sum row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              {isValid
                ? <Badge color="var(--status-done)" bg="var(--status-done-bg)">✓ Valid</Badge>
                : (
                  <div style={{
                    fontSize: 12, color: 'var(--status-alert)',
                    background: 'var(--status-alert-bg)', border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--status-alert)', borderRadius: 6, padding: '6px 12px',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {errors.length} error{errors.length !== 1 ? 's' : ''}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {errors.map((e, i) => (
                        <li key={i} style={{ marginTop: 2 }}>[{e.code}] {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )
              }
              {warnings.length > 0 && (
                <div style={{
                  fontSize: 11, color: 'var(--status-warn)',
                  background: 'var(--status-warn-bg)', border: '1px solid var(--border)',
                  borderLeft: '3px solid var(--status-warn)', borderRadius: 6, padding: '4px 10px',
                }}>
                  {warnings.map((w, i) => <div key={i}>[{w.code}] {w.message}</div>)}
                </div>
              )}
              <span style={{
                marginLeft: 'auto', fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)',
                background: sumOk ? 'var(--bg-elevated)' : 'var(--status-warn-bg)',
                color: sumOk ? 'var(--text-muted)' : 'var(--status-warn)',
              }}>
                Weights sum: {auditModel.effectiveSum.toFixed(4)}{!sumOk && ' ⚠'}
              </span>
            </div>
          </div>

          {/* Phase / WP breakdown table */}
          <div className="dashboard-summary-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Column header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px 90px 72px 72px',
              gap: 8, padding: '7px 16px',
              background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
            }}>
              {['Work Package', 'Duration', 'Eff. Weight', '', 'Scope'].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>{h}</span>
              ))}
            </div>

            {auditModel.phases.map((phase, pi) => (
              <div key={phase.id} style={{ borderBottom: pi < auditModel.phases.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* Phase row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 140px 90px 72px 72px',
                  gap: 8, alignItems: 'center',
                  padding: '9px 16px',
                  background: 'var(--bg-elevated)',
                  borderBottom: phase.wps.length > 0 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    {phase.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    phase weight: <strong style={{ color: 'var(--text-primary)' }}>{phase.progressWeight}</strong>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {phase.progressWeightPct.toFixed(1)}%
                  </span>
                  <MiniBar pct={phase.progressWeightPct} />
                  <span />
                </div>

                {/* WP rows */}
                {phase.wps.map((wp, wi) => (
                  <div key={wp.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 140px 90px 72px 72px',
                    gap: 8, alignItems: 'center',
                    padding: '7px 16px 7px 28px',
                    borderBottom: wi < phase.wps.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: wp.inScope ? 1 : 0.45,
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{wp.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {(wp.duration_pct * 100).toFixed(0)}%
                      <span style={{ color: 'var(--border)', margin: '0 4px' }}>·</span>
                      {(wp.durationPctInPhase * 100).toFixed(0)}% in phase
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {(wp.effectiveWeight * 100).toFixed(2)}%
                    </span>
                    <MiniBar pct={wp.effectiveWeight * 100} color={wp.inScope ? 'var(--accent)' : 'var(--text-muted)'} />
                    <Badge
                      color={wp.inScope ? 'var(--status-done)' : 'var(--text-muted)'}
                      bg={wp.inScope ? 'var(--status-done-bg)' : 'var(--bg-elevated)'}
                    >
                      {wp.inScope ? 'In scope' : 'Excluded'}
                    </Badge>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Excluded WPs list (project mode only) */}
          {mode === 'project' && auditModel.excludedWPs.length > 0 && (
            <div className="dashboard-summary-card" style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                Not in scope — {auditModel.excludedWPs.length} work package{auditModel.excludedWPs.length !== 1 ? 's' : ''}:
              </div>
              <div style={{ color: 'var(--text-muted)', lineHeight: 1.9 }}>
                {auditModel.excludedWPs.map(wp => wp.label).join(' · ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
