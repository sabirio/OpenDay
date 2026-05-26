// ── Schedule Risk Engine ──────────────────────────────────────────────────────
// Predictive risk scoring for Gantt schedules and multi-project portfolio health.

// ── Risk Level Constants ──────────────────────────────────────────────────────

export const RISK_LEVELS = {
  LOW:      "Low",
  MEDIUM:   "Medium",
  HIGH:     "High",
  CRITICAL: "Critical",
};

// ── getRiskLevel ──────────────────────────────────────────────────────────────

/**
 * Maps a 0–100 numeric risk score to a named risk level.
 *
 * @param {number} score
 * @returns {string}
 */
export function getRiskLevel(score) {
  if (score >= 76) return RISK_LEVELS.CRITICAL;
  if (score >= 51) return RISK_LEVELS.HIGH;
  if (score >= 26) return RISK_LEVELS.MEDIUM;
  return RISK_LEVELS.LOW;
}

// ── computeScheduleRisk ───────────────────────────────────────────────────────

/**
 * Computes a composite risk score (0–100) for a single project's schedule.
 *
 * Weighted factors:
 *   1. Critical path exposure  — weight 30
 *   2. Opening proximity       — weight 25
 *   3. Delay trend             — weight 20
 *   4. Blocked tasks           — weight 15
 *   5. Report cadence          — weight 10
 *
 * @param {{ scheduledTasks: object[], weeklyReports: object[], openingDate: Date|string|null, today?: Date }} params
 * @returns {{ riskScore: number, riskLevel: string, projectRiskIndex: number, factors: object }}
 */
export function computeScheduleRisk({
  scheduledTasks,
  weeklyReports,
  openingDate,
  today: todayParam,
}) {
  const today = todayParam ? new Date(todayParam) : new Date();
  today.setHours(0, 0, 0, 0);

  const tasks   = scheduledTasks || [];
  const reports = weeklyReports  || [];

  // ── Factor 1: Critical path exposure (weight 30) ───────────────────────────
  const criticalTasks           = tasks.filter((t) => t.critical);
  const criticalCount           = criticalTasks.length;
  const criticalIncompleteCount = criticalTasks.filter(
    (t) => t.status !== "Completed"
  ).length;

  const criticalExposureScore = Math.min(
    100,
    (criticalIncompleteCount / Math.max(1, criticalCount)) * 100
  );

  // ── Factor 2: Opening proximity (weight 25) ────────────────────────────────
  let openingProximityScore = 0;
  if (openingDate) {
    const openingMs    = new Date(openingDate).getTime();
    const daysToOpening = Math.ceil((openingMs - today.getTime()) / 86400000);
    if (daysToOpening < 60) {
      openingProximityScore = Math.max(0, ((60 - daysToOpening) / 60) * 100);
    }
    // If daysToOpening >= 60: score = 0 (already initialised to 0)
  }

  // ── Factor 3: Delay trend (weight 20) ─────────────────────────────────────
  const delayedCount = tasks.filter((t) => {
    if (t.status === "Delayed") return true;
    if (t.status === "Completed") return false;
    const plannedFinish = t.plannedFinish ? new Date(t.plannedFinish) : null;
    return plannedFinish && plannedFinish < today;
  }).length;

  const delayTrendScore = Math.min(
    100,
    (delayedCount / Math.max(1, tasks.length)) * 200
  );

  // ── Factor 4: Blocked tasks (weight 15) ───────────────────────────────────
  const taskMap    = new Map(tasks.map((t) => [t.id, t]));
  const blockedCount = tasks.filter((task) => {
    if (task.status === "Completed") return false;
    return (task.dependencies || []).some((dep) => {
      const pred = taskMap.get(dep.id);
      return pred && pred.status !== "Completed";
    });
  }).length;

  const blockedScore = Math.min(
    100,
    (blockedCount / Math.max(1, tasks.length)) * 300
  );

  // ── Factor 5: Report cadence (weight 10) ──────────────────────────────────
  let reportCadenceScore;
  if (!reports || reports.length === 0) {
    reportCadenceScore = 80;
  } else {
    // Find the most recent report date
    const latestReportMs = Math.max(
      ...reports.map((r) =>
        new Date(r.reportingDate || r.submittedAt || 0).getTime()
      )
    );
    const daysSinceReport = Math.ceil(
      (today.getTime() - latestReportMs) / 86400000
    );

    if (daysSinceReport > 14) {
      reportCadenceScore = 60;
    } else if (daysSinceReport > 7) {
      reportCadenceScore = 30;
    } else {
      reportCadenceScore = 0;
    }
  }

  // ── Weighted sum ───────────────────────────────────────────────────────────
  const WEIGHTS = {
    criticalExposure: 30,
    openingProximity: 25,
    delayTrend:       20,
    blocked:          15,
    reportCadence:    10,
  };

  const rawScore =
    criticalExposureScore * WEIGHTS.criticalExposure +
    openingProximityScore * WEIGHTS.openingProximity +
    delayTrendScore       * WEIGHTS.delayTrend       +
    blockedScore          * WEIGHTS.blocked          +
    reportCadenceScore    * WEIGHTS.reportCadence;

  const riskScore = Math.min(100, Math.max(0, Math.round(rawScore / 100)));

  const factors = {
    criticalExposure: {
      name:   "Critical Path Exposure",
      score:  Math.round(criticalExposureScore),
      weight: WEIGHTS.criticalExposure,
      detail: { criticalCount, criticalIncompleteCount },
    },
    openingProximity: {
      name:   "Opening Proximity",
      score:  Math.round(openingProximityScore),
      weight: WEIGHTS.openingProximity,
      detail: { openingDate: openingDate || null },
    },
    delayTrend: {
      name:   "Delay Trend",
      score:  Math.round(delayTrendScore),
      weight: WEIGHTS.delayTrend,
      detail: { delayedCount, totalTasks: tasks.length },
    },
    blocked: {
      name:   "Blocked Tasks",
      score:  Math.round(blockedScore),
      weight: WEIGHTS.blocked,
      detail: { blockedCount, totalTasks: tasks.length },
    },
    reportCadence: {
      name:   "Report Cadence",
      score:  Math.round(reportCadenceScore),
      weight: WEIGHTS.reportCadence,
      detail: { reportCount: reports.length },
    },
  };

  return {
    riskScore,
    riskLevel:        getRiskLevel(riskScore),
    projectRiskIndex: riskScore, // same value, different semantic label
    factors,
  };
}

// ── computePortfolioHealth ────────────────────────────────────────────────────

/**
 * Aggregates risk scores across all projects into a portfolio health score.
 *
 * @param {object[]} projects                            — array of project objects (must have `id`)
 * @param {Record<string, object[]>} scheduledTasksByProjectId
 * @param {Record<string, object[]>} reportsByProjectId
 * @param {Record<string, Date|string|null>} openingDateByProjectId
 * @returns {{ score: number, breakdown: object }}
 */
export function computePortfolioHealth(
  projects,
  scheduledTasksByProjectId,
  reportsByProjectId,
  openingDateByProjectId
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!projects || projects.length === 0) {
    return {
      score: 100,
      breakdown: {
        totalProjects:    0,
        criticalProjects: 0,
        averageRisk:      0,
        highRiskProjects: 0,
        projectScores:    [],
      },
    };
  }

  const projectScores = [];
  let totalRisk        = 0;
  let criticalProjects = 0;
  let highRiskProjects = 0;

  for (const project of projects) {
    const projectId      = project.id;
    const scheduledTasks = scheduledTasksByProjectId[projectId] || [];
    const weeklyReports  = reportsByProjectId[projectId]        || [];
    const openingDate    = openingDateByProjectId[projectId]    || null;

    const { riskScore, riskLevel, factors } = computeScheduleRisk({
      scheduledTasks,
      weeklyReports,
      openingDate,
      today,
    });

    // A project is "critical" if its target opening is within 30 days
    const openingMs = openingDate ? new Date(openingDate).getTime() : null;
    const daysToOpening = openingMs
      ? Math.ceil((openingMs - today.getTime()) / 86400000)
      : null;
    const isCriticalProject = daysToOpening !== null && daysToOpening <= 30;

    if (isCriticalProject) criticalProjects++;
    if (riskScore >= 51) highRiskProjects++;

    totalRisk += riskScore;

    projectScores.push({
      projectId,
      projectName:        project.name || project.projectName || projectId,
      riskScore,
      riskLevel,
      isCriticalProject,
      daysToOpening,
      factors,
    });
  }

  const averageRisk      = Math.round(totalRisk / projects.length);
  const portfolioScore   = Math.min(100, Math.max(0, Math.round(100 - averageRisk)));

  return {
    score: portfolioScore,
    breakdown: {
      totalProjects:    projects.length,
      criticalProjects,
      averageRisk,
      highRiskProjects,
      projectScores,
    },
  };
}
