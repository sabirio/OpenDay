// Schedule analysis — deviation from plan, predicted delay, weekly risk evolution trend.
// Implementations live in riskEngine; this file is the canonical import point.

export {
  computeScheduleDeviation,
  computeTrend,
  computeWeeklyEvolution,
} from "./riskEngine";
