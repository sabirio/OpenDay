import { addCustomBoqDraftItem, assessCustomBoqItem, buildProjectBoqPresentation, createProjectBoqDraft, normalizeBoqDecimalInput, patchProjectBoqDraftItem, removeProjectBoqDraftItem, sortProjectBoqDraftItems, syncProjectBoqDraftWithStandardCatalogue } from '../../domains/boq/projectBoqEditorModel.js';
import { createClientRequestId } from '../write/writeCommand.js';

export function prepareProjectBoqEditorState(context) {
  const baseline = createProjectBoqDraft({ ...context, items: context.items });
  const latest = context.selectedVersion?.id === context.latestVersion?.id || context.latestVersion == null;
  const draft = latest ? syncProjectBoqDraftWithStandardCatalogue(baseline, context, createClientRequestId) : baseline;
  return { baseline, draft };
}

export function presentProjectBoqEditor(input) { return buildProjectBoqPresentation(input); }
export function patchProjectBoqItem(draft, lineId, patch) { return patchProjectBoqDraftItem(draft, lineId, patch); }
export function removeProjectBoqItem(draft, lineId) { return removeProjectBoqDraftItem(draft, lineId); }
export function addCustomProjectBoqItem(draft, input, ontology) {
  return sortProjectBoqDraftItems(addCustomBoqDraftItem(draft, input, createClientRequestId), ontology);
}
export function patchProjectBoqDecimal(draft, lineId, field, rawValue) {
  const value = normalizeBoqDecimalInput(rawValue);
  return value == null ? draft : patchProjectBoqDraftItem(draft, lineId, { [field]: value === '' ? null : value });
}
export function patchProjectBoqIdentity(draft, patch) { return { ...draft, ...patch }; }
export function inspectCustomProjectBoqItem(input) { return assessCustomBoqItem(input); }
