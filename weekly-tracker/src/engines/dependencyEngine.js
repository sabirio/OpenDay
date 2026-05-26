// ── Dependency Engine ─────────────────────────────────────────────────────────
// Validates task dependency graphs, topologically sorts tasks, and detects
// manual-override schedule conflicts.

// ── Schedule Mode Constants ───────────────────────────────────────────────────

export const SCHEDULE_MODES = {
  AUTO:            "AUTO",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  LOCKED:          "LOCKED",
};

// ── validateDependencies ──────────────────────────────────────────────────────

// Tasks matching these name patterns must have at least one dependency
const DEPENDENCY_REQUIRED_PATTERN =
  /testing|commissioning|t&c|inspection|approval|certificate|training|handover/i;

/**
 * Validates a task list for:
 *   1. Broken dependency references (dep.id not found in tasks)
 *   2. Circular dependencies (DFS with WHITE/GRAY/BLACK coloring)
 *   3. Dependency gaps (T&C/handover tasks with no predecessors)
 *
 * @param {object[]} tasks
 * @returns {{ valid: boolean, error: object|null, brokenRefs: string[], warnings: object[] }}
 */
export function validateDependencies(tasks) {
  const WHITE = 0; // unvisited
  const GRAY  = 1; // in current DFS path (ancestor stack)
  const BLACK = 2; // fully processed

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const brokenRefs = [];

  // 1. Collect broken refs
  for (const task of tasks) {
    for (const dep of (task.dependencies || [])) {
      if (!taskMap.has(dep.id)) {
        brokenRefs.push(dep.id);
      }
    }
  }

  if (brokenRefs.length > 0) {
    return {
      valid: false,
      error: {
        type:       "broken_dependency_reference",
        severity:   "HIGH",
        message:    `${brokenRefs.length} dependency reference(s) point to unknown task IDs: ${brokenRefs.join(", ")}`,
        brokenRefs,
      },
      brokenRefs,
      warnings: [],
    };
  }

  // 2. Dependency-gap warnings: T&C / handover tasks with no dependencies
  const warnings = [];
  for (const task of tasks) {
    if (
      DEPENDENCY_REQUIRED_PATTERN.test(task.name || "") &&
      (task.dependencies || []).length === 0
    ) {
      warnings.push({
        taskId:   task.id,
        taskName: task.name || task.id,
        type:     "dependency_gap",
        severity: "MEDIUM",
        message:  `Task "${task.name || task.id}" appears to be a T&C/handover task but has no dependencies.`,
      });
    }
  }

  // 3. DFS cycle detection
  const color = new Map();
  const parent = new Map();

  for (const task of tasks) {
    color.set(task.id, WHITE);
    parent.set(task.id, null);
  }

  function formatCycle(startId, endId) {
    // Reconstruct the cycle path from parent map
    const path = [endId];
    let cur = endId;
    while (cur !== startId) {
      cur = parent.get(cur);
      path.push(cur);
      if (path.length > tasks.length + 2) break; // safety guard
    }
    path.reverse();
    path.push(endId); // close the loop
    return path;
  }

  function dfs(taskId) {
    color.set(taskId, GRAY);
    const task = taskMap.get(taskId);
    if (!task) return null; // broken ref — skip, already recorded

    for (const dep of (task.dependencies || [])) {
      const depId = dep.id;
      if (!taskMap.has(depId)) continue; // broken ref handled separately

      if (color.get(depId) === GRAY) {
        // Cycle detected — depId is an ancestor of taskId
        parent.set(taskId, depId);
        const cycle = formatCycle(depId, taskId);
        const cycleStr = cycle.join(" → ");
        return {
          valid: false,
          error: {
            type:     "dependency_error",
            severity: "HIGH",
            message:  `Circular dependency detected: ${cycleStr}`,
            cycle,
          },
          brokenRefs,
          warnings,
        };
      }

      if (color.get(depId) === WHITE) {
        parent.set(depId, taskId);
        const result = dfs(depId);
        if (result) return result;
      }
    }

    color.set(taskId, BLACK);
    return null;
  }

  for (const task of tasks) {
    if (color.get(task.id) === WHITE) {
      const result = dfs(task.id);
      if (result) return result;
    }
  }

  return { valid: true, error: null, brokenRefs, warnings };
}

// ── topoSort ──────────────────────────────────────────────────────────────────

/**
 * Topological sort using Kahn's algorithm.
 * THROWS the structured error object from validateDependencies if the graph is
 * invalid (cycle or broken refs that prevent a valid ordering).
 *
 * @param {object[]} tasks
 * @returns {string[]} sorted task IDs (dependencies first)
 */
export function topoSort(tasks) {
  const validation = validateDependencies(tasks);
  if (!validation.valid) {
    // Throw the structured error object directly — not a fallback append
    throw validation.error;
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // in-degree: number of dependencies each task has (ignoring broken refs)
  const inDegree = new Map();
  // successors[depId] = [taskId, ...] — tasks that come after depId
  const successors = new Map();

  for (const task of tasks) {
    if (!inDegree.has(task.id)) inDegree.set(task.id, 0);
    if (!successors.has(task.id)) successors.set(task.id, []);

    for (const dep of (task.dependencies || [])) {
      if (!taskMap.has(dep.id)) continue; // skip broken refs (already validated)
      if (!successors.has(dep.id)) successors.set(dep.id, []);
      successors.get(dep.id).push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
    }
  }

  // Queue: all tasks with no remaining dependencies
  const queue = [];
  for (const task of tasks) {
    if ((inDegree.get(task.id) || 0) === 0) {
      queue.push(task.id);
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(id);

    for (const successorId of (successors.get(id) || [])) {
      const newDegree = (inDegree.get(successorId) || 0) - 1;
      inDegree.set(successorId, newDegree);
      if (newDegree === 0) {
        queue.push(successorId);
      }
    }
  }

  return sorted;
}

// ── checkManualOverrideConflicts ──────────────────────────────────────────────

/**
 * For tasks in MANUAL_OVERRIDE mode with a _manualOffset set, checks whether
 * the manual position respects all dependency constraints (FS/SS/FF/SF + lag).
 *
 * @param {object[]} scheduledTasks  — tasks with _manualOffset, duration, dependencies
 * @returns {object[]} array of conflict warnings
 */
export function checkManualOverrideConflicts(scheduledTasks) {
  const warnings = [];
  const taskMap = new Map(scheduledTasks.map((t) => [t.id, t]));

  for (const task of scheduledTasks) {
    if (
      task.scheduleMode !== SCHEDULE_MODES.MANUAL_OVERRIDE ||
      task._manualOffset === undefined
    ) {
      continue;
    }

    const taskStart  = task._manualOffset;
    const taskFinish = taskStart + (task.duration || 0);

    for (const dep of (task.dependencies || [])) {
      const predecessor = taskMap.get(dep.id);
      if (!predecessor) continue;

      // Use manual offset if available; fall back to CPM early dates
      const predStart = predecessor._manualOffset ?? predecessor.earlyStart;
      if (predStart === undefined) continue;
      const predFinish = predecessor._manualOffset !== undefined
        ? predStart + (predecessor.duration || 0)
        : (predecessor.earlyFinish ?? predStart + (predecessor.duration || 0));
      const lag        = dep.lag || 0;
      const depType    = (dep.type || "FS").toUpperCase();

      // Compute the minimum allowed start for this task given the dependency
      let minStart;
      switch (depType) {
        case "FS": // Finish-to-Start: task cannot start before pred finishes + lag
          minStart = predFinish + lag;
          break;
        case "SS": // Start-to-Start: task cannot start before pred starts + lag
          minStart = predStart + lag;
          break;
        case "FF": // Finish-to-Finish: task cannot finish before pred finishes + lag
          // => minStart = (predFinish + lag) - task.duration
          minStart = predFinish + lag - (task.duration || 0);
          break;
        case "SF": // Start-to-Finish: task cannot finish before pred starts + lag
          // => minStart = (predStart + lag) - task.duration
          minStart = predStart + lag - (task.duration || 0);
          break;
        default:
          minStart = predFinish + lag;
      }

      if (taskStart < minStart) {
        const overlap = minStart - taskStart;
        warnings.push({
          taskId:   task.id,
          taskName: task.name || task.id,
          type:     "manual_override_conflict",
          severity: "HIGH",
          message:  `Task "${task.name || task.id}" manual position conflicts with dependency on "${predecessor.name || predecessor.id}" (${depType}${lag ? ` +${lag}d` : ""}): starts ${overlap} day(s) too early.`,
          depId:    dep.id,
          depType,
          lag,
          taskStart,
          minStart,
        });
      }
    }
  }

  return warnings;
}
