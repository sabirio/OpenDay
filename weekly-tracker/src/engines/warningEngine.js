// ── Warning Engine ────────────────────────────────────────────────────────────
// Generates structured warnings from scheduled tasks, opening date, and weekly
// report history. Also detects progress anomalies across consecutive reports.

// ── Internal: severity sort order ─────────────────────────────────────────────

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function severitySort(a, b) {
  return (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
}

// ── generateWarnings ──────────────────────────────────────────────────────────

/**
 * Generates all schedule/progress warnings for a set of scheduled tasks.
 *
 * Warning types:
 *   delayed            — task overdue and not completed
 *   suspicious         — progress reported but no actual start recorded
 *   blocked            — task has unmet dependencies (predecessor not completed)
 *   no_report          — in-progress task has no associated report activity
 *   not_started        — task should have started (planned start in the past) but hasn't
 *   opening_at_risk    — critical-path task delayed with opening date approaching
 *   baseline_variance  — actual finish differs from baseline finish (NEW)
 *   locked_task_moved  — a LOCKED task has a manual offset applied (NEW)
 *
 * @param {object[]} scheduledTasks   — tasks from the Gantt engine (with _startOffset, _finishOffset, etc.)
 * @param {Date|string|null} openingDate
 * @param {object[]} weeklyReports
 * @returns {object[]} warnings sorted by severity
 */
export function generateWarnings(scheduledTasks, openingDate, weeklyReports) {
  const warnings = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const openingMs = openingDate ? new Date(openingDate).getTime() : null;
  const daysToOpening = openingMs
    ? Math.ceil((openingMs - today.getTime()) / 86400000)
    : null;

  const taskMap = new Map((scheduledTasks || []).map((t) => [t.id, t]));

  for (const task of scheduledTasks || []) {
    const status       = task.status || "Not Started";
    const isCompleted  = status === "Completed";
    const isInProgress = status === "In Progress";
    const isNotStarted = status === "Not Started";
    const progress     = task.progress || 0;

    // Resolve planned dates — prefer absolute Date fields, fall back to offsets
    const plannedStart = task.plannedStart
      ? new Date(task.plannedStart)
      : task._startOffset !== undefined && openingDate
        ? new Date(new Date(openingDate).getTime() - task._startOffset * 86400000)
        : null;

    const plannedFinish = task.plannedFinish
      ? new Date(task.plannedFinish)
      : task._finishOffset !== undefined && openingDate
        ? new Date(new Date(openingDate).getTime() - task._finishOffset * 86400000)
        : null;

    const actualStart  = task.actualStart  ? new Date(task.actualStart)  : null;
    const actualFinish = task.actualFinish ? new Date(task.actualFinish) : null;

    // ── delayed ───────────────────────────────────────────────────────────────
    if (!isCompleted && plannedFinish && plannedFinish < today) {
      const overdueDays = Math.ceil((today.getTime() - plannedFinish.getTime()) / 86400000);
      warnings.push({
        taskId:   task.id,
        taskName: task.name,
        type:     "delayed",
        severity: task.critical ? "HIGH" : "MEDIUM",
        message:  `"${task.name}" is ${overdueDays} day(s) overdue (planned finish: ${plannedFinish.toLocaleDateString()}).`,
        overdueDays,
      });
    }

    // ── suspicious ────────────────────────────────────────────────────────────
    // Progress > 0 but no actualStart recorded
    if (!isNotStarted && progress > 0 && !actualStart) {
      warnings.push({
        taskId:   task.id,
        taskName: task.name,
        type:     "suspicious",
        severity: "MEDIUM",
        message:  `"${task.name}" reports ${progress}% progress but has no recorded actual start date.`,
        progress,
      });
    }

    // ── blocked ───────────────────────────────────────────────────────────────
    // Task is not started/in-progress but one of its predecessors is not completed
    if (!isCompleted) {
      for (const dep of (task.dependencies || [])) {
        const predecessor = taskMap.get(dep.id);
        if (predecessor && predecessor.status !== "Completed") {
          warnings.push({
            taskId:   task.id,
            taskName: task.name,
            type:     "blocked",
            severity: "HIGH",
            message:  `"${task.name}" is blocked — predecessor "${predecessor.name || dep.id}" is not yet completed (${predecessor.status || "unknown"}).`,
            blockedBy: dep.id,
          });
          break; // one warning per task is enough
        }
      }
    }

    // ── not_started ───────────────────────────────────────────────────────────
    if (isNotStarted && plannedStart && plannedStart < today) {
      const lateDays = Math.ceil((today.getTime() - plannedStart.getTime()) / 86400000);
      warnings.push({
        taskId:   task.id,
        taskName: task.name,
        type:     "not_started",
        severity: task.critical ? "HIGH" : "MEDIUM",
        message:  `"${task.name}" was planned to start ${lateDays} day(s) ago (${plannedStart.toLocaleDateString()}) but has not started.`,
        lateDays,
      });
    }

    // ── no_report ─────────────────────────────────────────────────────────────
    // In-progress task has a reportKey but no matching report activity
    if (isInProgress && task.reportKey && weeklyReports && weeklyReports.length > 0) {
      const hasReport = weeklyReports.some((r) => {
        const allStatuses = {
          ...(r.constructionStatuses || {}),
          ...(r.testingStatuses || {}),
          ...(r.handoverStatuses || {}),
          ...(r.demolitionStatuses || {}),
        };
        return Object.prototype.hasOwnProperty.call(allStatuses, task.reportKey);
      });

      if (!hasReport) {
        warnings.push({
          taskId:   task.id,
          taskName: task.name,
          type:     "no_report",
          severity: "LOW",
          message:  `"${task.name}" is in progress but has not appeared in any weekly report.`,
        });
      }
    }

    // ── opening_at_risk ───────────────────────────────────────────────────────
    if (
      task.critical &&
      !isCompleted &&
      plannedFinish &&
      plannedFinish < today &&
      daysToOpening !== null &&
      daysToOpening <= 30
    ) {
      warnings.push({
        taskId:   task.id,
        taskName: task.name,
        type:     "opening_at_risk",
        severity: "CRITICAL",
        message:  `Critical task "${task.name}" is delayed and the opening date is only ${daysToOpening} day(s) away — opening is at risk.`,
        daysToOpening,
      });
    }

    // ── baseline_variance (NEW) ───────────────────────────────────────────────
    if (task.baselineFinish && actualFinish) {
      const baselineFinishMs = new Date(task.baselineFinish).getTime();
      const actualFinishMs   = actualFinish.getTime();
      const variance = Math.ceil((actualFinishMs - baselineFinishMs) / 86400000);

      if (variance > 0) {
        warnings.push({
          taskId:   task.id,
          taskName: task.name,
          type:     "baseline_variance",
          severity: task.critical ? "HIGH" : "MEDIUM",
          message:  `"${task.name}" finished ${variance} day(s) later than its baseline (baseline: ${new Date(task.baselineFinish).toLocaleDateString()}, actual: ${actualFinish.toLocaleDateString()}).`,
          variance,
          baselineFinish: task.baselineFinish,
          actualFinish:   task.actualFinish,
        });
      }
    }

    // ── locked_task_moved (NEW) ───────────────────────────────────────────────
    if (task.scheduleMode === "LOCKED" && task._manualOffset !== undefined) {
      warnings.push({
        taskId:   task.id,
        taskName: task.name,
        type:     "locked_task_moved",
        severity: "HIGH",
        message:  `"${task.name}" is LOCKED but has a manual offset applied — its schedule position may have been changed unintentionally.`,
        manualOffset: task._manualOffset,
      });
    }
  }

  // Sort by severity
  return warnings.sort(severitySort);
}

// ── detectProgressAnomalies ───────────────────────────────────────────────────

/**
 * Scans consecutive weekly reports for suspicious jumps in status
 * (e.g. "Not Started" → "Completed" in a single report cycle).
 *
 * @param {object[]} reports  — array of weekly report objects
 * @returns {object[]} anomaly warnings
 */
export function detectProgressAnomalies(reports) {
  if (!reports || reports.length < 2) return [];

  // Sort ascending by reporting date
  const sorted = [...reports].sort((a, b) => {
    const dateA = new Date(a.reportingDate || a.submittedAt || 0).getTime();
    const dateB = new Date(b.reportingDate || b.submittedAt || 0).getTime();
    return dateA - dateB;
  });

  const STATUS_PHASES = [
    { field: "constructionStatuses", phase: "Construction" },
    { field: "testingStatuses",      phase: "Testing & Commissioning" },
    { field: "handoverStatuses",     phase: "Handover" },
    { field: "demolitionStatuses",   phase: "Demolition" },
  ];

  function isNotStarted(status) {
    if (!status) return false;
    const s = status.toString().toLowerCase();
    return s.includes("not") || s === "no";
  }

  function isCompleted(status) {
    if (!status) return false;
    const s = status.toString().toLowerCase();
    return s.includes("completed") || s.includes("ready") || s.includes("accepted");
  }

  const anomalies = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const reportDate = curr.reportingDate || curr.submittedAt;

    for (const { field, phase } of STATUS_PHASES) {
      const prevStatuses = prev[field] || {};
      const currStatuses = curr[field] || {};

      // Check all work packages present in either report
      const allKeys = new Set([
        ...Object.keys(prevStatuses),
        ...Object.keys(currStatuses),
      ]);

      for (const workPackage of allKeys) {
        const prevStatus = prevStatuses[workPackage];
        const currStatus = currStatuses[workPackage];

        if (isNotStarted(prevStatus) && isCompleted(currStatus)) {
          anomalies.push({
            type:        "progress_anomaly",
            severity:    "CRITICAL",
            message:     `Suspicious jump in "${workPackage}": went from "${prevStatus}" to "${currStatus}" in a single report`,
            workPackage,
            phase,
            reportDate,
            prevStatus,
            currStatus,
          });
        }
      }
    }
  }

  return anomalies;
}
