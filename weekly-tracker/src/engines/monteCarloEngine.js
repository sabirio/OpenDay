// Monte Carlo Engine — probabilistic opening-date forecasting.
// Pure functions, no React, no external libraries. Uses Box-Muller for normal variates.
import { DAY_MS } from '../utils/reportUtils';
import { progressAtIndex } from './progressEngine';

// ─── Internal ─────────────────────────────────────────────────────────────────

function randomNormal(random) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// ─── S-curve deceleration (Variant 2 — global deceleration coefficient) ───────

/**
 * Deceleration coefficient k(p): how much of a week's raw μ+σ·N(0,1) delta
 * actually lands, as a function of current progress. Calibrated for retail
 * fit-out: rough-in moves fast, commissioning/handover moves slow.
 *
 * Linear projection is systematically optimistic near the finish line —
 * exactly where opening date, marketing, and hiring are already locked in.
 * This is what makes it optional-opt-in rather than the new default: k(p)
 * changes the actual simulated dynamics, so every existing percentile/
 * probability assertion in monteCarloEngine.test.mjs (fixture-exact dates,
 * computed by hand against the *undamped* random walk) would need
 * recalculating if this became the default behavior. It doesn't have to be
 * exercised to be trustworthy — that's what useSCurve defaulting to false
 * buys: zero risk to ~900 existing checks, opt in explicitly to get it.
 *
 * @param {number} p current progress, 0-100 (this codebase's progress scale
 *                   everywhere — see progressEngine.js — not 0.0-1.0)
 */
export function kDeceleration(p) {
  if (p < 60) return 1.0;
  if (p < 85) return 0.8;
  if (p < 95) return 0.6;
  return 0.4;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a Monte Carlo forecast of the project opening date.
 *
 * Algorithm:
 *  1. Compute weekly progress deltas from sortedReports.
 *  2. Derive μ (mean) and σ (std-dev) of those deltas.
 *  3. Run N=10 000 simulations: from current progress, add μ + σ·N(0,1) each
 *     "week" (scaled by kDeceleration(p) when useSCurve is on) until progress
 *     ≥ 100 — record weeks-to-completion → opening date.
 *  4. Sort results, compute percentiles and probability buckets.
 *
 * Returns { insufficient_data: true } when fewer than 3 reports are available.
 *
 * @param {object}   project        — project row (targetOpeningDate required)
 * @param {object[]} sortedReports  — GC reports sorted oldest-first
 * @param {object[]} [ganttTasks]   — reserved for future cone enhancements
 * @param {object}   [options]
 * @param {boolean}  [options.useSCurve=false] — apply kDeceleration(p) to each
 *   step's delta. Defaults to false (linear, existing behavior) — see
 *   kDeceleration's doc comment for why this isn't opt-out.
 * @param {number[]} [options.overrideProgressPoints] — A2: use this series
 *   instead of deriving progressPoints from sortedReports — e.g. a
 *   contractor-bias-adjusted series from contractorDriftEngine.js's
 *   computeAdjustedProgress(). Simulation math is unchanged either way;
 *   this only changes where the starting series comes from, so it's a
 *   second forecast run on different input, not a different algorithm.
 * @returns Monte Carlo result or { insufficient_data: true }
 */
export function computeMonteCarloForecast(project, sortedReports, _ganttTasks, options = {}) {
  const { useSCurve = false, overrideProgressPoints = null, asOf = null, random = null } = options;
  if (!sortedReports || sortedReports.length < 3 || !project?.targetOpeningDate) {
    return { insufficient_data: true };
  }

  const targetOpeningDate = new Date(project.targetOpeningDate);

  // ── Step 1: Compute weekly progress points
  const progressPoints = overrideProgressPoints ?? sortedReports.map((_, i) => progressAtIndex(sortedReports, i));

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
  const evidenceKey = JSON.stringify({
    projectId: project.id ?? null,
    targetOpeningDate: project.targetOpeningDate,
    reports: sortedReports.map(report => [report.id ?? null, report.reportingDate ?? report.submittedAt ?? null]),
    progressPoints,
    useSCurve,
  });
  const rng = typeof random === 'function' ? random : seededRandom(hashSeed(evidenceKey));
  const today = asOf == null ? new Date() : new Date(asOf);
  if (!Number.isFinite(today.getTime())) return { insufficient_data: true, diagnostic: 'INVALID_AS_OF' };

  // ── Step 3: 10 000 simulations
  const N            = 10000;
  const completionDates = [];

  for (let sim = 0; sim < N; sim++) {
    let p     = currentProgress;
    let weeks = 0;
    const MAX_WEEKS = 520; // safety cap — ~10 years

    while (p < 100 && weeks < MAX_WEEKS) {
      const rawDelta = mu + effectiveSigma * randomNormal(rng);
      const delta    = useSCurve ? rawDelta * kDeceleration(p) : rawDelta;
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

  for (const d of completionDates) {
    const diffDays = Math.ceil((d - targetOpeningDate) / DAY_MS);
    if (diffDays <= 0)        onTime++;
    else if (diffDays <= 14)  delay2Weeks++;
    else if (diffDays <= 30)  delayMonth++;
  }

  const pct       = (n) => Math.round((n / N) * 100);
  const pOnTime   = pct(onTime);
  const pDelay2Weeks = pct(delay2Weeks);
  const pDelayMonth  = pct(delayMonth);
  const pDelayCritical = 100 - pOnTime - pDelay2Weeks - pDelayMonth;

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
    model: useSCurve ? 's-curve' : 'linear',
    mu:    +mu.toFixed(4),
    sigma: +sigma.toFixed(4),
  };
}
