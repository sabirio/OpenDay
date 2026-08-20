import { useState, useEffect, useMemo } from 'react';
import { fetchActiveTemplate, fetchTemplateById } from '../data/templatesApi';
import { buildWeightAuditModel, getScopeWPIds, isWithinEpsilon } from '../hooks/useWeightAuditModel';
import { fractionToPercent } from '../hooks/useChartMathPresentation';
import { constructionRetailV1 } from '../domains/construction/templates/constructionRetailV1';
import { WORK_PACKAGES as GANTT_WPS } from '../config/masterTaskLibrary';
import { Badge, Button, CONTROL_CLASS, ProgressBar as MiniBar, Surface } from '../components/shared/UiPrimitives.jsx';
import { PageHeader, PageShell } from '../components/shared/LayoutPrimitives.jsx';
import { EmptyState, LoadingState } from '../components/shared/UiPatterns.jsx';

// Domain label maps — resolved once at module load, never in core
const PHASE_LABELS = Object.fromEntries(
  constructionRetailV1.phases.map(p => [p.id, p.label])
);
const WP_LABELS = Object.fromEntries(
  constructionRetailV1.phases.flatMap(ph =>
    (ph.workPackages || []).map(wp => [wp.id, wp.label])
  )
);

// ── Tiny shared primitives ────────────────────────────────────────────────────
// ── Page ──────────────────────────────────────────────────────────────────────
export default function WeightAudit({ projects }) {
  const [mode,              setMode]              = useState('project');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const selectedProject = projects.find(p => String(p.id) === selectedProjectId) ?? null;

  // Project mode with no templateId needs no fetch at all — template is
  // definitionally null, computed directly during render (no effect, no
  // state, no loading flicker). Only the two fetch-requiring cases (active
  // template in 'template' mode, or a project's specific templateId) go
  // through the effect below, which derives `loading`/`template` from
  // whether `templateResult.key` matches the current `templateKey` rather
  // than resetting via a synchronous setState at the top of the effect.
  const resolvedProjectTemplateId = selectedProject?.templateId ?? null;
  const needsTemplateFetch = mode === 'template' || !!resolvedProjectTemplateId;
  const templateKey = mode === 'template' ? 'active' : resolvedProjectTemplateId ? `id:${resolvedProjectTemplateId}` : null;

  const [templateResult, setTemplateResult] = useState({ key: null, template: null });

  useEffect(() => {
    if (!needsTemplateFetch) return;
    const key = templateKey;
    let alive = true;
    const fetcher = mode === 'template' ? fetchActiveTemplate() : fetchTemplateById(resolvedProjectTemplateId);
    fetcher.then(t => { if (alive) setTemplateResult({ key, template: t }); });
    return () => { alive = false; };
  }, [needsTemplateFetch, mode, templateKey, resolvedProjectTemplateId]);

  const loading = needsTemplateFetch && templateResult.key !== templateKey;
  const template = needsTemplateFetch && templateResult.key === templateKey ? templateResult.template : null;

  const scopeWPIds = useMemo(() => {
    if (mode !== 'project' || !selectedProject) return null;
    return getScopeWPIds(selectedProject.scope, GANTT_WPS);
  }, [mode, selectedProject]);

  const auditModel = useMemo(
    () => buildWeightAuditModel(template, scopeWPIds, PHASE_LABELS, WP_LABELS),
    [template, scopeWPIds]
  );

  const pinnedProjects = projects.filter(p => p.templateId);
  const errors         = auditModel?.validation.filter(i => i.severity === 'error')   ?? [];
  const warnings       = auditModel?.validation.filter(i => i.severity === 'warning') ?? [];
  const isValid        = errors.length === 0;
  const sumOk          = auditModel ? isWithinEpsilon(auditModel.effectiveSum, 1) : true;

  return <PageShell>
    <PageHeader title="Weight Audit" description="Inspect how template weights and work-package durations roll up into effective weights."/>
    <Surface className="flex flex-wrap items-end gap-3 p-4">
      <div className="flex gap-1">{[['project', 'Project'], ['template', 'Active Template']].map(([id, label]) => <Button key={id} variant={mode === id ? 'primary' : 'secondary'} size="sm" onClick={() => setMode(id)}>{label}</Button>)}</div>
      {mode === 'project' ? <label className="grid min-w-64 gap-1 text-xs font-bold text-ui-secondary"><span>Project</span><select className={CONTROL_CLASS} value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)}><option value="">— select project —</option>{pinnedProjects.map(project => <option key={project.id} value={String(project.id)}>{project.storeCode} — {project.shoppingMallName}</option>)}</select></label> : null}
    </Surface>
    {loading ? <LoadingState label="Loading template…"/> : null}
    {!loading && mode === 'project' && !selectedProject ? <EmptyState title="Select a project" body="Select a project to inspect its pinned template weights."/> : null}
    {!loading && mode === 'project' && selectedProject && !selectedProject.templateId ? <div className="rounded-ui border border-ui-warning bg-ui-warning-subtle p-4 text-sm text-ui-warning">This project has no pinned template — it uses built-in default weights and appears identical to the full-scope view of the active template.</div> : null}
    {!loading && auditModel ? <div className="grid gap-4">
      <Surface className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-base text-ui-primary">{auditModel.templateMeta.name}</strong>{auditModel.templateMeta.version != null ? <Badge tone="accent">v{auditModel.templateMeta.version}</Badge> : null}{mode === 'template' ? <Badge tone="positive">Active</Badge> : null}{mode === 'project' && selectedProject ? <span className="text-xs text-ui-muted">Pinned to {selectedProject.storeCode} — {selectedProject.shoppingMallName}{scopeWPIds && ` · ${scopeWPIds.length} WPs in scope`}</span> : null}</div>
        <div className="flex flex-wrap items-start gap-2">{isValid ? <Badge tone="positive">✓ Valid</Badge> : <div className="rounded-ui-sm border border-ui-danger bg-ui-danger-subtle px-3 py-2 text-xs text-ui-danger"><strong>{errors.length} error{errors.length !== 1 ? 's' : ''}</strong><ul className="mt-1 list-disc pl-4">{errors.map((error, index) => <li key={index}>[{error.code}] {error.message}</li>)}</ul></div>}{warnings.length ? <div className="rounded-ui-sm border border-ui-warning bg-ui-warning-subtle px-3 py-2 text-xs text-ui-warning">{warnings.map((warning, index) => <div key={index}>[{warning.code}] {warning.message}</div>)}</div> : null}<Badge tone={sumOk ? 'neutral' : 'warning'}>Weights sum: {auditModel.effectiveSum.toFixed(4)}{!sumOk && ' ⚠'}</Badge></div>
      </Surface>
      <Surface>
        <div className="overflow-x-auto"><div className="min-w-[720px]"><div className="grid grid-cols-[1fr_140px_90px_72px_72px] gap-2 border-b border-ui-border bg-ui-elevated px-4 py-2">{['Work Package', 'Duration', 'Eff. Weight', '', 'Scope'].map(label => <span key={label} className="text-xs font-bold uppercase tracking-wider text-ui-muted">{label}</span>)}</div>{auditModel.phases.map((phase, phaseIndex) => <div key={phase.id} className={phaseIndex < auditModel.phases.length - 1 ? 'border-b border-ui-border' : ''}><div className={`grid grid-cols-[1fr_140px_90px_72px_72px] items-center gap-2 bg-ui-elevated px-4 py-2 ${phase.wps.length ? 'border-b border-ui-border' : ''}`}><span className="text-xs font-bold uppercase tracking-wide text-ui-secondary">{phase.label}</span><span className="text-xs tabular-nums text-ui-muted">phase weight: <strong className="text-ui-primary">{phase.progressWeight}</strong></span><span className="text-xs font-bold tabular-nums text-ui-primary">{phase.progressWeightPct.toFixed(1)}%</span><MiniBar pct={phase.progressWeightPct}/><span/></div>{phase.wps.map((wp, wpIndex) => <div key={wp.id} className={`grid grid-cols-[1fr_140px_90px_72px_72px] items-center gap-2 px-4 py-2 pl-7 ${wpIndex < phase.wps.length - 1 ? 'border-b border-ui-border' : ''} ${wp.inScope ? '' : 'opacity-45'}`}><span className="text-xs text-ui-primary">{wp.label}</span><span className="text-xs tabular-nums text-ui-muted">{fractionToPercent(wp.duration_pct).toFixed(0)}% <span className="mx-1 text-ui-border">·</span>{fractionToPercent(wp.durationPctInPhase).toFixed(0)}% in phase</span><span className="text-xs font-bold tabular-nums text-ui-primary">{fractionToPercent(wp.effectiveWeight).toFixed(2)}%</span><MiniBar pct={fractionToPercent(wp.effectiveWeight)} tone={wp.inScope ? 'accent' : 'muted'}/><Badge tone={wp.inScope ? 'positive' : 'neutral'}>{wp.inScope ? 'In scope' : 'Excluded'}</Badge></div>)}</div>)}</div></div>
      </Surface>
      {mode === 'project' && auditModel.excludedWPs.length ? <Surface className="p-4 text-xs leading-6 text-ui-muted"><strong>Not in scope — {auditModel.excludedWPs.length} work package{auditModel.excludedWPs.length !== 1 ? 's' : ''}:</strong><p>{auditModel.excludedWPs.map(wp => wp.label).join(' · ')}</p></Surface> : null}
    </div> : null}
  </PageShell>;
}
