// Monte Carlo Engine — probabilistic opening-date forecasting.
// Pure functions, no React, no external libraries. Uses Box-Muller for normal variates.
import {
  computeWPCumulativeStatuses,
  computeCumulativeStatuses,
  estimateProgressFromStatuses,
} from '../utils/reportUtils';
import { computeProjectProgressFromWP } from '../config/workPackages';

// ─── Internal ─────────────────────────────────────────────────────────────────

function randomNormal() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function progressAtIndex(sortedReports, index) {
  const slice = sortedReports.slice(0, index + 1);
  const wpCum = computeWPCumulativeStatuses(slice);
  if (wpCum?.workPackageStatuses) {
    return computeProjectProgressFromWP(wpCum.workPackageStatuses);
  }
  return estimateProgressFromStatuses(computeCumulativeStatuses(slice));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a Monte Carlo forecast of the project opening date.
 *
 * Algorithm:
 *  1. Compute weekly progress deltas from sortedReports.
 *  2. Derive μ (mean) and σ (std-dev) of those deltas.
 *  3. Run N=10 000 simulations: from current progress, add μ + σ·N(0,1) each
 *     "week" until progress ≥ 100 — record weeks-to-completion → opening date.
 *  4. Sort results, compute percentiles and probability buckets.
 *
 * Returns { insufficient_data: true } when fewer than 3 reports are available.
 *
 * @param {object}   project        — project row (targetOpeningDate required)
 * @param {object[]} sortedReports  — GC reports sorted oldest-first
 * @param {object[]} [ganttTasks]   — reserved for future cone enhancements
 * @returns Monte Carlo result or { insufficient_data: true }
 */
export function computeMonteCarloForecast(project, sortedReports, ganttTasks) {
  if (!sortedReports || sortedReports.length < 3 || !project?.targetOpeningDate) {
    return { insufficient_data: true };
  }

  const targetOpeningDate = new Date(project.targetOpeningDate);

  // ── Step 1: Compute weekly progress points
  const progressPoints = sortedReports.map((_, i) => progressAtIndex(sortedReports, i));

  // ── Step 2: Compute deltas between consecutive reports
  const deltas = [];
  for (let i = 1; i < progressPoints.length; i++) {
    const d = progressPoints[i] - progressPoints[i - 1];
    deltas.push(d);
  }

  if (deltas.length === 0) return { insufficient_data: true };

  const mu    = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const sigma = Math.sqrt(deltas.reduce((s, d) => s + (d - mu) ** 2, 0) / deltas.length);

  // Protect against stalled projects where sigma = 0
  const effectiveSigma = Math.max(sigma, 0.5);

  // Current state
  const currentProgress = progressPoints[progressPoints.length - 1];
  const today           = new Date();

  // ── Step 3: 10 000 simulations
  const N            = 10000;
  const completionDates = [];

  for (let sim = 0; sim < N; sim++) {
    let p     = currentProgress;
    let weeks = 0;
    const MAX_WEEKS = 520; // safety cap — ~10 years

    while (p < 100 && weeks < MAX_WEEKS) {
      const delta = mu + effectiveSigma * randomNormal();
      p    += Math.max(0, delta); // progress can't go backwards in aggregate
      weeks++;
    }

    if (weeks >= MAX_WEEKS) {
      // Project never finishes — add extreme outlier date
      completionDates.push(addDays(today, weeks * 7));
    } else {
      completionDates.push(addDays(today, weeks * 7));
    }
  }

  // ── Step 4: Sort and compute percentiles
  completionDates.sort((a, b) => a - b);

  const p10 = completionDates[Math.floor(N * 0.10)];
  const p50 = completionDates[Math.floor(N * 0.50)];
  const p90 = completionDates[Math.floor(N * 0.90)];

  // Probability buckets relative to targetOpeningDate
  let onTime      = 0;
  let delay2Weeks = 0;
  let delayMonth  = 0;
  let delayCrit   = 0;

  for (const d of completionDates) {
    const diffDays = Math.ceil((d - targetOpeningDate) / 86400000);
    if (diffDays <= 0)        onTime++;
    else if (diffDays <= 14)  delay2Weeks++;
    else if (diffDays <= 30)  delayMonth++;
    else                      delayCrit++;
  }

  const pct       = (n) => Math.round((n / N) * 100);
  const pOnTime   = pct(onTime);
  const pDelay2Weeks = pct(delay2Weeks);
  const pDelayMonth  = pct(delayMonth);
  const pDelayCritical = pct(delayCrit);

  return {
    insufficient_data:  false,
    simulations:        N,
    currentProgress,
    targetOpeningDate,
    p10,
    p50,
    p90,
    pOnTime,
    pDelay2Weeks,
    pDelayMonth,
    pDelayCritical,
    highRisk: pOnTime < 25,
    cone: { optimistic: p10, median: p50, pessimistic: p90 },
  };
}
