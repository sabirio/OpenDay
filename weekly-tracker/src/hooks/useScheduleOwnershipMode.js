// Hook-layer re-export facade (Simplification Phase 3C.1) — pages/components
// must never import core/ directly (architecture guard's layer-import rule);
// this is the one indirection point for the canonical schedule ownership
// mode helper, matching the existing useContractorScheduleOrchestration.js
// pattern.
export { isContractorManaged, SCHEDULE_OWNERSHIP_MODE } from '../core/schedule/scheduleOwnershipMode.js';
