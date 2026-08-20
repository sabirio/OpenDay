import { useState, useEffect, useMemo } from 'react';
import { setPhaseWeight, setWorkPackageDuration, movePhase, normalizeWeights, computeTemplateWeightSums, validateTemplate, isTemplateValid, countErrors, isWithinEpsilon, WEIGHT_SUM_TARGET } from '../hooks/useTemplateEditorModel.js';
import { fetchActiveTemplate, saveTemplate } from '../data/templatesApi.js';
import { Badge, Button, CONTROL_CLASS, Surface } from '../components/shared/UiPrimitives.jsx';
import { PageShell, SectionHeader } from '../components/shared/LayoutPrimitives.jsx';
import { LoadingState } from '../components/shared/UiPatterns.jsx';

const EPS = 0.001;

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
    return <LoadingState label="Loading template…"/>;
  }

  return (
    <PageShell width="narrow" inset="page">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-ui-primary">
          Template Editor
        </h2>
        <Badge tone={valid ? 'positive' : 'danger'}>
          {valid ? 'Valid' : `${errorCount} error${errorCount !== 1 ? 's' : ''}`}
        </Badge>
        {!templateId && (
          <span className="text-xs italic text-ui-muted">
            (no active template in DB — changes cannot be saved)
          </span>
        )}
      </div>

      {/* Weight summary bar */}
      <Surface className="flex items-center gap-3 p-4">
        <span className="text-sm text-ui-secondary">
          Σ weight:{' '}
          <strong className={weightOk ? 'text-ui-success' : 'text-ui-danger'}>
            {weightSum}
          </strong>
          {' '}/ {WEIGHT_SUM_TARGET}
        </span>
        <Button className="ml-auto"
          onClick={() => setDraft(normalizeWeights(draft))}
        >
          Normalize
        </Button>
      </Surface>

      {/* Phases list */}
      <div className="grid gap-2">
        {sortedPhases.map((phase, i) => {
          const isFirst    = i === 0;
          const isLast     = i === sortedPhases.length - 1;
          const durSum     = durSums[phase.id] || 0;
          const durOk      = isWithinEpsilon(durSum, 1, EPS);
          const phaseWPs   = wpsByPhase[phase.id] || [];
          const isExpanded = !!expanded[phase.id];

          return (
            <Surface key={phase.id} className="p-4">
              <div className="flex items-center gap-2">

                {/* Move buttons */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button size="sm"
                    disabled={isFirst}
                    onClick={() => setDraft(movePhase(draft, phase.id, 'up'))}
                  >↑</Button>
                  <Button size="sm"
                    disabled={isLast}
                    onClick={() => setDraft(movePhase(draft, phase.id, 'down'))}
                  >↓</Button>
                </div>

                {/* Phase label */}
                <span className="flex-1 text-sm font-semibold text-ui-primary">
                  {phase.label}
                </span>

                {/* progressWeight input */}
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-ui-muted">
                  weight:
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={phase.progressWeight ?? 0}
                    className={`${CONTROL_CLASS} w-16`}
                    onChange={e => setDraft(setPhaseWeight(draft, phase.id, Number(e.target.value)))}
                  />
                </label>

                {/* Duration sum */}
                <span className={`shrink-0 text-xs ${durOk ? 'text-ui-muted' : 'text-ui-danger'}`}>
                  Σ dur: {durSum.toFixed(2)}
                </span>

                {/* Expand toggle */}
                {phaseWPs.length > 0 && (
                  <Button size="sm" className="shrink-0"
                    onClick={() => setExpanded(prev => ({ ...prev, [phase.id]: !prev[phase.id] }))}
                  >
                    {isExpanded ? '▾' : '▸'} {phaseWPs.length} WPs
                  </Button>
                )}
              </div>

              {/* Expanded WP rows */}
              {isExpanded && (
                <div className="mt-3 border-t border-ui-border pt-3">
                  {phaseWPs.map((wp, j) => (
                    <div key={wp.id} className={`flex items-center gap-2 py-1 ${j < phaseWPs.length - 1 ? 'border-b border-ui-border' : ''}`}>
                      <span className="flex-1 text-xs text-ui-secondary">{wp.label}</span>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-ui-muted">
                        duration_pct:
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={wp.duration_pct ?? 0}
                          className={`${CONTROL_CLASS} w-20`}
                          onChange={e => setDraft(setWorkPackageDuration(draft, wp.id, Number(e.target.value)))}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          );
        })}
      </div>

      {/* Issues panel */}
      {issues.length > 0 && (
        <Surface><SectionHeader title={`Issues (${issues.length})`}/><div className="px-4">
          {issues.map((issue, idx) => (
            <div key={idx} className={`flex items-start gap-2 py-2 text-xs leading-5 ${idx < issues.length - 1 ? 'border-b border-ui-border' : ''}`}>
              <Badge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                {issue.severity}
              </Badge>
              <span className="shrink-0 font-bold text-ui-secondary">
                {issue.code}
              </span>
              <span className="text-ui-muted">{issue.message}</span>
            </div>
          ))}
        </div></Surface>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-3">
        {saveStatus === 'saved' && (
          <span className="text-xs font-semibold text-ui-success">Saved</span>
        )}
        {saveStatus?.error && (
          <span className="text-xs text-ui-danger">{saveStatus.error}</span>
        )}
        {saveStatus === 'saving' && (
          <span className="text-xs text-ui-muted">Saving…</span>
        )}
        <Button onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary"
          disabled={!canSave}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
    </PageShell>
  );
}
