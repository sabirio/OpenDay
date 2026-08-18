import { useCallback, useEffect, useMemo, useState } from 'react';
import { addCustomProjectBoqItem, inspectCustomProjectBoqItem, patchProjectBoqDecimal, patchProjectBoqIdentity, patchProjectBoqItem, prepareProjectBoqEditorState, presentProjectBoqEditor, removeProjectBoqItem } from '../core/presentation/projectBoqPresentationModel.js';
import { commitProjectBoqRevision, loadProjectBoqEditorContext } from '../core/boq/projectBoqOrchestration.js';
import { planProjectBoqWorkbookImport, commitProjectBoqWorkbookImport } from '../core/boq/projectBoqSpreadsheetOrchestration.js';

export function useProjectBoqEditor(project, mode = 'CONSULTANT_MEASURED') {
  const [state, setState] = useState({ status: 'loading', context: null, draft: null, baseline: null, error: null });
  const [saving, setSaving] = useState(false);
  const [importState, setImportState] = useState({ status: 'idle', file: null, plan: null });

  const load = useCallback(async (versionId = null) => {
    if (!project) return;
    setState(current => ({ ...current, status: 'loading', error: null }));
    try {
      const context = await loadProjectBoqEditorContext(project, { versionId });
      const { baseline, draft } = prepareProjectBoqEditorState(context);
      setState({ status: 'ready', context, draft, baseline, error: null });
      setImportState({ status: 'idle', file: null, plan: null });
    } catch (error) {
      setState(current => ({ ...current, status: 'error', error }));
    }
  }, [project]);

  useEffect(() => { load(); }, [load]);

  const presentation = useMemo(() => presentProjectBoqEditor({ draft: state.draft, baseline: state.baseline, context: state.context, mode }), [mode, state.baseline, state.context, state.draft]);
  const patchItem = useCallback((lineId, patch) => setState(current => ({ ...current, draft: patchProjectBoqItem(current.draft, lineId, patch) })), []);
  const patchDecimal = useCallback((lineId, field, value) => setState(current => ({ ...current, draft: patchProjectBoqDecimal(current.draft, lineId, field, value) })), []);
  const removeItem = useCallback(lineId => setState(current => ({ ...current, draft: removeProjectBoqItem(current.draft, lineId) })), []);
  const addCustom = useCallback(input => setState(current => ({
    ...current,
    draft: addCustomProjectBoqItem(current.draft, input, current.context.ontology),
  })), []);
  const patchDraft = useCallback(patch => setState(current => ({ ...current, draft: patchProjectBoqIdentity(current.draft, patch) })), []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const result = await commitProjectBoqRevision(project.id, state.draft);
      await load(result.versionId);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error };
    } finally {
      setSaving(false);
    }
  }, [load, project?.id, state.draft]);

  const previewImport = useCallback(async file => {
    const data = await file.arrayBuffer();
    const exchangeFile = { filename: file.name, data };
    const plan = planProjectBoqWorkbookImport(exchangeFile, {
      ...state.context, version: state.context.latestVersion, items: state.draft.items,
    });
    setImportState({ status: plan.ok ? 'ready' : 'invalid', file: exchangeFile, plan });
    return plan;
  }, [state.context, state.draft]);

  const commitImport = useCallback(async () => {
    setImportState(current => ({ ...current, status: 'committing' }));
    try {
      const outcome = await commitProjectBoqWorkbookImport(project.id, importState.file, {
        ...state.context, version: state.context.latestVersion, items: state.draft.items,
      });
      await load(outcome.result.versionId);
      return { ok: true, ...outcome };
    } catch (error) {
      setImportState(current => ({ ...current, status: 'invalid', plan: { ok: false, issues: error.issues || [{ code: error.code }] } }));
      return { ok: false, error };
    }
  }, [importState.file, load, project?.id, state.context, state.draft]);

  return {
    ...state, saving, presentation, dirty: presentation.dirty, issues: presentation.issues, isLatest: presentation.isLatest, importState, loadVersion: load,
    patchDraft, patchItem, patchDecimal, removeItem, addCustom, inspectCustom: inspectCustomProjectBoqItem, save, previewImport, commitImport,
    reset: () => setState(current => ({ ...current, draft: current.baseline })),
  };
}
