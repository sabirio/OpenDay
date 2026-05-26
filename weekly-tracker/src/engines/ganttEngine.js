// ── Gantt / CPM Schedule Engine ───────────────────────────────────────────────
// Public facade — wires together sub-modules while keeping a stable API so all
// existing consumers (GanttChart, Gantt, etc.) continue to work unchanged.

import {
  topoSort            as _topoSort,
  validateDependencies as _validateDependencies,
  checkManualOverrideConflicts as _checkConflicts,
  SCHEDULE_MODES      as _SCHEDULE_MODES,
} from "./dependencyEngine";

import { generateWarnings as _generateWarnings } from "./warningEngine";

import {
  computeScheduleRisk  as _computeScheduleRisk,
  computePortfolioHealth as _computePortfolioHealth,
  getRiskLevel         as _getRiskLevel,
  RISK_LEVELS          as _RISK_LEVELS,
} from "./scheduleRiskEngine";

// ── Re-exports: new module APIs (consumers can import from here) ───────────────

export const SCHEDULE_MODES = _SCHEDULE_MODES;
export const RISK_LEVELS    = _RISK_LEVELS;

export function validateDependencies(tasks)              { return _validateDependencies(tasks); }
export function checkManualOverrideConflicts(scheduled)  { return _checkConflicts(scheduled); }
export function computeScheduleRisk(opts)                { return _computeScheduleRisk(opts); }
export function computePortfolioHealth(...args)          { return _computePortfolioHealth(...args); }
export function getRiskLevel(score)                      { return _getRiskLevel(score); }

// ── Utilities ──────────────────────────────────────────────────────────────────

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

export function daysBetween(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}

let _seq = Date.now();
export function genId() {
  return (_seq++).toString(36);
}

export const DEP_TYPES = ["FS", "SS", "FF", "SF"];

export const DEP_LABELS = {
  FS: "Finish → Start",
  SS: "Start → Start",
  FF: "Finish → Finish",
  SF: "Start → Finish",
};

export const TASK_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed",
  "Delayed",
  "Blocked",
];

export const STATUS_COLORS = {
  "Not Started": "#475569",
  "In Progress": "#2563eb",
  "Completed":   "#16a34a",
  "Delayed":     "#dc2626",
  "Blocked":     "#7c3aed",
};

// ── Forward Pass ───────────────────────────────────────────────────────────────
// Computes earlyStart / earlyFinish in days from project start.
// Respects scheduleMode: LOCKED pins to actualStart; MANUAL_OVERRIDE / legacy
// _manualOffset override the dependency-computed start; AUTO is pure CPM.

function forwardPass(taskMap, sortedIds, projectStart) {
  const es = {};
  const ef = {};

  sortedIds.forEach((id) => {
    const t   = taskMap[id];
    const dur = Math.max(1, t.duration || 1);
    const mode = t.scheduleMode || _SCHEDULE_MODES.AUTO;

    // ── LOCKED: pin to actualStart (or _manualOffset fallback) ────────────────
    if (mode === _SCHEDULE_MODES.LOCKED) {
      let fixedStart = 0;
      if (t.actualStart) {
        fixedStart = Math.round(
          (new Date(t.actualStart) - new Date(projectStart)) / 86400000
        );
      } else if (t._manualOffset !== undefined) {
        fixedStart = t._manualOffset;
      }
      es[id] = Math.max(0, fixedStart);
      ef[id] = es[id] + dur;
      return;
    }

    // ── AUTO / MANUAL_OVERRIDE ─────────────────────────────────────────────────
    let start = 0;
    (t.dependencies || []).forEach((dep) => {
      if (!taskMap[dep.id]) return;
      const lag  = dep.lag  || 0;
      const type = dep.type || "FS";
      const pES  = es[dep.id] ?? 0;
      const pEF  = ef[dep.id] ?? 0;
      switch (type) {
        case "FS": start = Math.max(start, pEF + lag);       break;
        case "SS": start = Math.max(start, pES + lag);       break;
        case "FF": start = Math.max(start, pEF + lag - dur); break;
        case "SF": start = Math.max(start, pES + lag - dur); break;
        default:   start = Math.max(start, pEF + lag);
      }
    });

    if (t._manualOffset !== undefined) {
      start = Math.max(0, t._manualOffset);
    }

    es[id] = Math.max(0, start);
    ef[id] = es[id] + dur;
  });

  return { es, ef };
}

// ── Backward Pass ──────────────────────────────────────────────────────────────

function backwardPass(taskMap, sortedIds, projectFinish) {
  const ls = {};
  const lf = {};

  const succ = {};
  sortedIds.forEach((id) => { succ[id] = []; });
  sortedIds.forEach((id) => {
    (taskMap[id].dependencies || []).forEach((dep) => {
      if (succ[dep.id] !== undefined) {
        succ[dep.id].push({ id, type: dep.type || "FS", lag: dep.lag || 0 });
      }
    });
  });

  [...sortedIds].reverse().forEach((id) => {
    const t    = taskMap[id];
    const dur  = Math.max(1, t.duration || 1);
    let finish = projectFinish;

    (succ[id] || []).forEach((s) => {
      const lag  = s.lag  || 0;
      const type = s.type;
      const sLS  = ls[s.id] ?? projectFinish;
      const sLF  = lf[s.id] ?? projectFinish;
      switch (type) {
        case "FS": finish = Math.min(finish, sLS - lag);       break;
        case "SS": finish = Math.min(finish, sLS - lag + dur); break;
        case "FF": finish = Math.min(finish, sLF - lag);       break;
        case "SF": finish = Math.min(finish, sLF - lag + dur); break;
        default:   finish = Math.min(finish, sLS - lag);
      }
    });

    lf[id] = finish;
    ls[id] = finish - dur;
  });

  return { ls, lf };
}

// ── Weight Normalisation ───────────────────────────────────────────────────────

function normalizeWeights(tasks) {
  const total   = tasks.reduce((s, t) => s + (t.weight || 1), 0);
  const divisor = total || tasks.length || 1;
  return tasks.map((t) => ({ ...t, normalizedWeight: (t.weight || 1) / divisor }));
}

// ── computeProjectProgress ─────────────────────────────────────────────────────

export function computeProjectProgress(tasks) {
  if (!tasks.length) return 0;
  const norm = normalizeWeights(tasks);
  return Math.round(
    norm.reduce((s, t) => s + (t.progress || 0) * t.normalizedWeight, 0)
  );
}

// ── calculateSchedule ──────────────────────────────────────────────────────────
// Returns [] (not throws) if the dependency graph is invalid.
// Use validateDependencies(tasks) for structured error reporting before calling.

export function calculateSchedule(tasks, projectStartDate) {
  if (!tasks || !tasks.length) return [];

  const start   = new Date(projectStartDate || new Date());
  const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]));

  let sortedIds;
  try {
    sortedIds = _topoSort(tasks);
  } catch (err) {
    console.error("[ganttEngine] Schedule aborted — dependency error:", err.message || err);
    return [];
  }

  const { es, ef }    = forwardPass(taskMap, sortedIds, start);
  const projectFinish = Math.max(...sortedIds.map((id) => ef[id] ?? 0), 1);
  const { ls, lf }    = backwardPass(taskMap, sortedIds, projectFinish);

  const norm    = normalizeWeights(tasks);
  const normMap = Object.fromEntries(norm.map((t) => [t.id, t.normalizedWeight]));

  return sortedIds.map((id) => {
    const task        = taskMap[id];
    const earlyStart  = es[id] ?? 0;
    const earlyFinish = ef[id] ?? earlyStart + Math.max(1, task.duration || 1);
    const lateStart   = ls[id] ?? earlyStart;
    const lateFinish  = lf[id] ?? earlyFinish;
    const totalFloat  = Math.max(0, lateFinish - earlyFinish);
    const critical    = totalFloat <= 0;

    // Schedule variance vs baseline (positive = behind; negative = ahead)
    const scheduleVariance =
      task.baselineEarlyFinish !== undefined
        ? earlyFinish - task.baselineEarlyFinish
        : null;

    return {
      ...task,
      earlyStart,
      earlyFinish,
      lateStart,
      lateFinish,
      totalFloat,
      critical,
      scheduleVariance,
      plannedStart:     addDays(start, earlyStart),
      plannedFinish:    addDays(start, earlyFinish),
      normalizedWeight: normMap[id] ?? 0,
    };
  });
}

// ── CRUD helpers ───────────────────────────────────────────────────────────────

export function recalculate(tasks, changedTask, projectStart) {
  return calculateSchedule(
    tasks.map((t) => (t.id === changedTask.id ? changedTask : t)),
    projectStart
  );
}

export function addTask(tasks, overrides, projectStart) {
  const task = {
    id:           genId(),
    name:         "New Task",
    duration:     5,
    dependencies: [],
    weight:       1,
    status:       "Not Started",
    progress:     0,
    actualStart:  null,
    actualFinish: null,
    scheduleMode: _SCHEDULE_MODES.AUTO,
    ...overrides,
  };
  return calculateSchedule([...tasks, task], projectStart);
}

export function removeTask(tasks, taskId, projectStart) {
  return calculateSchedule(
    tasks
      .filter((t) => t.id !== taskId)
      .map((t) => ({
        ...t,
        dependencies: (t.dependencies || []).filter((d) => d.id !== taskId),
      })),
    projectStart
  );
}

// ── generateWarnings ───────────────────────────────────────────────────────────
// Merges base schedule warnings (warningEngine) with MANUAL_OVERRIDE conflicts
// (dependencyEngine). Backwards-compatible — same signature and return shape.

export function generateWarnings(scheduledTasks, openingDate, weeklyReports) {
  const base      = _generateWarnings(scheduledTasks, openingDate, weeklyReports);
  const overrides = _checkConflicts(scheduledTasks);

  const ord = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...base, ...overrides].sort(
    (a, b) => (ord[a.severity] ?? 4) - (ord[b.severity] ?? 4)
  );
}

// ── Baseline helpers ───────────────────────────────────────────────────────────

// Snapshot the current CPM schedule as a baseline.
// Adds baselineEarlyStart / baselineEarlyFinish / baselineDuration to each task.
export function lockBaseline(scheduledTasks) {
  return scheduledTasks.map((t) => ({
    ...t,
    baselineEarlyStart:  t.earlyStart,
    baselineEarlyFinish: t.earlyFinish,
    baselineDuration:    t.duration,
    baselineLocked:      true,
  }));
}

// Schedule variance for a single task (positive = behind schedule).
export function computeTaskVariance(task) {
  if (task.baselineEarlyFinish === undefined) return null;
  return (task.earlyFinish ?? 0) - task.baselineEarlyFinish;
}

// Schedule Performance Index.  Returns null when no baseline data exists.
export function computeSPI(tasks) {
  const withBaseline = tasks.filter((t) => t.baselineProgress !== undefined);
  if (!withBaseline.length) return null;

  const norm    = normalizeWeights(tasks);
  const normMap = Object.fromEntries(norm.map((t) => [t.id, t.normalizedWeight]));
  const earned  = tasks.reduce((s, t) => s + (t.progress   || 0) / 100 * (normMap[t.id] || 0), 0);
  const planned = tasks.reduce((s, t) => s + (t.baselineProgress !== undefined ? (t.baselineProgress || 0) / 100 * (normMap[t.id] || 0) : 0), 0);

  if (planned === 0) return earned > 0 ? 2 : 1;
  return Math.round((earned / planned) * 100) / 100;
}

// ── Report status → task fields ────────────────────────────────────────────────

export function mapStatusToProgress(statusStr) {
  if (!statusStr) return 0;
  const s = statusStr.toLowerCase().trim();
  if (s.includes("completed") || s.includes("ready") || s.includes("accepted")) return 100;
  if (s.includes("in progress") || s.includes("started")) return 50;
  if (s.includes("planned") || s.includes("scheduled")) return 25;
  return 0;
}

export function mapStatusToTaskStatus(statusStr) {
  if (!statusStr) return "Not Started";
  const s = statusStr.toLowerCase().trim();
  if (s.includes("completed") || s.includes("ready") || s.includes("accepted")) return "Completed";
  if (s.includes("blocked") || s.includes("critical")) return "Blocked";
  if (s.includes("delayed") || s.includes("at risk")) return "Delayed";
  if (s.includes("in progress") || s.includes("started")) return "In Progress";
  return "Not Started";
}
