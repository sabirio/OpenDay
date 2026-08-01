// Canonical per-project schedule ownership mode — the single source of
// truth for "who owns this project's planned schedule right now."
//
// AUTO_GENERATED: the existing v1/retail-fitout-v2 CPM path
//   (generateAndSaveGantt/regenerateGantt) owns planned dates. Every project
//   is this mode unless explicitly set otherwise — no project is ever
//   silently converted.
// CONTRACTOR_MANAGED: the contractor draft-schedule RPC
//   (save_contractor_schedule_draft) owns planned dates. Automatic
//   generation/regeneration must refuse to run against a project in this
//   mode — see the guards in ganttOrchestrationModel.js.
//
// These two modes are mutually exclusive per project by construction: never
// derive ownership indirectly (from null dates, template name, contractor
// role, or UI state) — always read this one column.
export const SCHEDULE_OWNERSHIP_MODE = Object.freeze({
  AUTO_GENERATED: 'AUTO_GENERATED',
  CONTRACTOR_MANAGED: 'CONTRACTOR_MANAGED',
});

export function isContractorManaged(scheduleOwnershipMode) {
  return scheduleOwnershipMode === SCHEDULE_OWNERSHIP_MODE.CONTRACTOR_MANAGED;
}
