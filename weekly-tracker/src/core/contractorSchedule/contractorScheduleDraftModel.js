// Pure Contractor Draft schedule buffer — no Supabase, no React. Edits
// (move/resize/manual entry, all collapsed by useContractorScheduleDraft.js
// into the same {plannedStart, plannedFinish} shape) stay local here until
// an explicit Save Draft. Nothing is written to the DB by these functions —
// see contractorScheduleService.js / saveDraftFromState below for the one
// atomic write.
//
// Canonical representation is HUMAN-FACING INCLUSIVE (Simplification Phase
// 3B.1): plannedFinish is the last calendar day of work, matching exactly
// what save_contractor_schedule_draft's p_changes expects (see 047's own
// header). Converting a drag/resize's internal exclusive boundary into this
// shape is the caller's (useContractorScheduleDraft.js's) job, via the one
// canonical adapter in engines/ganttLayout.js — this module never sees or
// performs that conversion, so there is exactly one place it happens.

/** @typedef {{ plannedStart: string, plannedFinish: string }} StagedDates */
/** @typedef {{ changesByWpId: Record<string, StagedDates> }} DraftState */

/** @returns {DraftState} */
export function createEmptyDraftState() {
  return { changesByWpId: {} };
}

/**
 * Stage (or replace) a task's pending dates. Does not touch any other
 * task's staged change.
 * @param {DraftState} state
 * @returns {DraftState}
 */
export function stageTaskDates(state, wpId, plannedStart, plannedFinish) {
  if (!wpId) throw new Error('stageTaskDates requires a wpId');
  return {
    changesByWpId: { ...state.changesByWpId, [wpId]: { plannedStart, plannedFinish } },
  };
}

/**
 * Discard one task's staged change, reverting it to whatever is currently
 * persisted (the caller re-reads the persisted row; this buffer only
 * forgets the pending edit).
 * @param {DraftState} state
 * @returns {DraftState}
 */
export function discardTaskChange(state, wpId) {
  if (!(wpId in state.changesByWpId)) return state;
  const next = { ...state.changesByWpId };
  delete next[wpId];
  return { changesByWpId: next };
}

/** @returns {DraftState} */
export function discardAllChanges() {
  return createEmptyDraftState();
}

/** @param {DraftState} state */
export function isDirty(state) {
  return Object.keys(state.changesByWpId).length > 0;
}

/** @param {DraftState} state */
export function changedTaskCount(state) {
  return Object.keys(state.changesByWpId).length;
}

/**
 * The exact array shape save_contractor_schedule_draft's p_changes expects
 * — {wpId, plannedStart, plannedFinish}, human-facing inclusive, passed
 * through with zero conversion (the server does its own canonicalization).
 * @param {DraftState} state
 * @returns {Array<{wpId: string, plannedStart: string, plannedFinish: string}>}
 */
export function toChangesArray(state) {
  return Object.entries(state.changesByWpId).map(([wpId, dates]) => ({
    wpId,
    plannedStart: dates.plannedStart,
    plannedFinish: dates.plannedFinish,
  }));
}

/**
 * Apply a successful save's result: clear only the changes that were
 * actually part of this save (defensive — in the current single-page-at-a-
 * time UI every staged change is always included, but this keeps the
 * reconcile step correct even if a future caller sends a subset).
 * @param {DraftState} state
 * @param {string[]} savedWpIds
 * @returns {DraftState}
 */
export function reconcileAfterSave(state, savedWpIds) {
  const saved = new Set(savedWpIds);
  const next = {};
  for (const [wpId, dates] of Object.entries(state.changesByWpId)) {
    if (!saved.has(wpId)) next[wpId] = dates;
  }
  return { changesByWpId: next };
}
