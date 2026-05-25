// Progress calculation utilities — consolidated entry point.
// Core implementations live in src/utils/reportUtils.js;
// engines can import from here rather than reaching into utils directly.

export {
  PHASE_ORDER,
  getStatusScore,
  computeCumulativeStatuses,
  estimateProgressFromStatuses,
} from "../utils/reportUtils";
