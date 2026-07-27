// dateMath — the ONE canonical generic calendar-day-difference utility.
// Moved out of ganttLayout.js (Gantt-specific layout/geometry module) into
// its own neutral home so non-Gantt consumers (Historical Data Foundation,
// Benchmark Engine) depend on a generic date utility instead of on a
// Gantt-layout module. Formula is byte-for-byte unchanged from the prior
// ganttLayout.js implementation — this is a move, not a rewrite.
//
// Note: engines/ganttEngine.js has its own SEPARATE, private (non-exported
// beyond its own module) diffDays used for CPM scheduling, which normalizes
// both inputs to UTC midnight before diffing. That is a deliberately
// different formula for a different purpose (whole-calendar-day scheduling
// irrespective of any time-of-day component) and is out of scope here — this
// module only centralizes the generic ms/86400000 implementation that
// ganttLayout.js and historyEngine.js already shared.

/** Whole days between two dates (end - start), rounded. */
export function diffDays(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000);
}
