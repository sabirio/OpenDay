import { useCallback, useEffect, useMemo, useState } from 'react';
import { appendConsultantCustomItem, changeConsultantBoq, changeConsultantCustomItem, changeConsultantQuantity, commitConsultantBoq, decideConsultantBoq, discardConsultantCustomItem, loadConsultantBoqEditor, presentConsultantBoq, sendConsultantBoq } from '../core/commercial/consultantBoqOrchestration.js';

export function useConsultantBoq(tenderId) {
  const [state, setState] = useState({ status: 'loading', draft: null, error: null });
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    if (!tenderId) return;
    setState(current => ({ ...current, status: 'loading', error: null }));
    try { setState({ status: 'ready', draft: await loadConsultantBoqEditor(tenderId), error: null }); }
    catch (error) { setState({ status: 'error', draft: null, error }); }
  }, [tenderId]);
  useEffect(() => {
    let active = true;
    if (!tenderId) return () => { active = false; };
    loadConsultantBoqEditor(tenderId).then(draft => { if (active) setState({ status: 'ready', draft, error: null }); }).catch(error => { if (active) setState({ status: 'error', draft: null, error }); });
    return () => { active = false; };
  }, [tenderId]);

  const update = useCallback(transform => setState(current => ({ ...current, draft: transform(current.draft) })), []);
  const run = useCallback(async (name, command) => {
    setBusy(name);
    try { const result = await command(); await load(); return { ok: true, result }; }
    catch (error) { return { ok: false, error }; }
    finally { setBusy(null); }
  }, [load]);

  const presentation = useMemo(() => presentConsultantBoq(state.draft), [state.draft]);
  return {
    ...state,
    presentation,
    busy,
    retry: load,
    patchQuantity: (lineId, value) => update(draft => changeConsultantQuantity(draft, lineId, value)),
    patchDraft: patch => update(draft => changeConsultantBoq(draft, patch)),
    addCustom: workGroupId => update(draft => appendConsultantCustomItem(draft, workGroupId)),
    patchCustom: (lineId, patch) => update(draft => changeConsultantCustomItem(draft, lineId, patch)),
    removeCustom: lineId => update(draft => discardConsultantCustomItem(draft, lineId)),
    save: () => run('save', () => commitConsultantBoq(state.draft)),
    submit: () => run('submit', () => sendConsultantBoq(state.draft)),
    review: decision => run(decision.toLowerCase(), () => decideConsultantBoq(state.draft, decision)),
  };
}
