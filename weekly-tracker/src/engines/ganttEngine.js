// Gantt Engine — pure functions, no React imports, testable in plain Node.js.
import { WORK_PACKAGES, PHASES, getPhaseById } from '../config/masterTaskLibrary.js';
import { DEPENDENCY_RULES } from '../config/dependencyRules.js';
import { resolveTemplateWPs } from '../config/projectTemplates.js';
import { buildV2ProgressTemplate } from '../core/projects/weights/buildV2ProgressTemplate.js';
import { retailFitoutV2, getWPByIdV2 } from '../domains/construction/templates/retailFitoutV2.js';

// Increment whenever the engine produces structurally different planned dates.
// Any saved Gantt with a different (or null) version is considered stale.
export const GANTT_ENGINE_VERSION = 2;

// True when project has a Gantt but it was built by an older engine version.
export function isGanttStale(project) {
  if (!project?.ganttGeneratedAt) return false;
  return (project.ganttEngineVersion ?? null) !== GANTT_ENGINE_VERSION;
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function diffDays(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  s.setUTCHours(0, 0, 0, 0);
  e.setUTCHours(0, 0, 0, 0);
  return Math.round((e - s) / 86400000);
}

function toUTCMidnight(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── STEP 0: Build WP objects with durations ─────────────────────────────────

/**
 * Build WP objects with calculated durations for a given template + date range.
 *
 * @param {string} templateId
 * @param {Date|string} projectStart
 * @param {Date|string} targetOpeningDate
 * @param {number} storeSizeSqm
 * @param {object} [options]
 * @param {string[]} [options.selectedPhases]   — for custom template
 * @param {string[]} [options.selectedWPIds]    — for custom template (individual WP selection)
 * @returns WP[] with duration_days added
 */
export function buildProjectWPs(templateId, projectStart, targetOpeningDate, storeSizeSqm, options = {}) {
  const start = toUTCMidnight(projectStart);
  const end   = toUTCMidnight(targetOpeningDate);
  const total_days = diffDays(start, end);

  if (total_days <= 0) throw new Error('targetOpeningDate must be after projectStart');

  // Size modifier
  let sizeModifier = 1.0;
  if (storeSizeSqm > 2000) sizeModifier = 1.15;
  else if (storeSizeSqm < 500) sizeModifier = 0.90;

  const wpIds = resolveTemplateWPs(templateId, options);
  const wpIdSet = new Set(wpIds);
  const activeWPs = WORK_PACKAGES.filter(wp => wpIdSet.has(wp.id));

  // Normalize phase weights over included phases so excluded phases don't shrink the window.
  const includedPhaseIds = new Set(activeWPs.map(wp => wp.phaseId));
  const sumIncluded = PHASES
    .filter(p => includedPhaseIds.has(p.id))
    .reduce((s, p) => s + (p.phaseWeight || 0), 0);
  const phaseWeightNorm = Object.fromEntries(
    PHASES.map(p => [p.id, sumIncluded > 0 ? p.phaseWeight / sumIncluded : 0])
  );

  return activeWPs.map(wp => {
      const phase = getPhaseById(wp.phaseId);
      const raw = total_days * phaseWeightNorm[wp.phaseId] * wp.duration_pct * sizeModifier;
      const duration_days = Math.max(1, Math.round(raw));

      return {
        id:              wp.id,
        label:           wp.label,
        phaseId:         wp.phaseId,
        phaseLabel:      phase?.label || wp.phaseId,
        phaseOrder:      phase?.order || 99,
        duration_pct:    wp.duration_pct,
        isBlocker:       wp.isBlocker,
        defaultLag_days: wp.defaultLag_days,
        duration_days,
        // Progress (populated later from DB / contractor report)
        actual_progress: 0,
        status:          'not_started',
        actual_start:    null,
        actual_end:      null,
        site_visit_progress: null,
        discrepancy_status:  null,
        is_archived:     false,
      };
    });
}

/**
 * v2 (zoned) equivalent of buildProjectWPs — fully additive, does not alter
 * buildProjectWPs or any v1 behavior. Reuses the same size-modifier and
 * duration-seeding formula, driven by buildV2ProgressTemplate's synthetic
 * phases (one per category, progressWeight = zoneWeight% x categoryShare%)
 * instead of masterTaskLibrary's PHASES/WORK_PACKAGES.
 *
 * project_gantt_tasks has no zone/category columns (no migrations) — each
 * returned WP's phaseId is set to its ZONE id (not category id) purely so
 * the existing phase_id/phase_label DB columns get a reasonable,
 * GanttChart.jsx-compatible backward-fill value (3 zone bands, not 23
 * category bands). The canonical zone+category grouping for forms comes
 * from getWPGrouping(), never from this stored value — see that file's doc
 * comment.
 *
 * @param {Record<string, number>} zoneAreas — project.scope.zoneAreas, e.g. { sales: 700, boh: 300 }
 * @param {Date|string} projectStart
 * @param {Date|string} targetOpeningDate
 * @param {number} storeSizeSqm
 * @param {object} [options]
 * @param {string[]} [options.activeZoneIds] — project.scope.zones
 * @param {string[]} [options.activeCategoryIds] — project.scope.categories
 * @param {string[]} [options.selectedWPIds] — project.scope.workPackages
 * @returns WP[] with duration_days added, same shape as buildProjectWPs()
 */
export function buildProjectWPsV2(zoneAreas, projectStart, targetOpeningDate, storeSizeSqm, options = {}) {
  const start = toUTCMidnight(projectStart);
  const end   = toUTCMidnight(targetOpeningDate);
  const total_days = diffDays(start, end);

  if (total_days <= 0) throw new Error('targetOpeningDate must be after projectStart');

  let sizeModifier = 1.0;
  if (storeSizeSqm > 2000) sizeModifier = 1.15;
  else if (storeSizeSqm < 500) sizeModifier = 0.90;

  const { activeZoneIds = null, activeCategoryIds = null, selectedWPIds = null } = options;
  const template = buildV2ProgressTemplate(zoneAreas, activeZoneIds, activeCategoryIds);

  let activeWPs = template.workPackages;
  if (selectedWPIds && selectedWPIds.length > 0) {
    const set = new Set(selectedWPIds);
    activeWPs = activeWPs.filter(wp => set.has(wp.id));
  }

  // Re-normalize category (phase) weights over only categories that still
  // have >=1 active WP — mirrors buildProjectWPs' own phaseWeightNorm
  // re-normalization so a narrowed scope doesn't shrink the schedule window.
  const includedPhaseIds = new Set(activeWPs.map(wp => wp.phaseId));
  const sumIncluded = template.phases
    .filter(p => includedPhaseIds.has(p.id))
    .reduce((s, p) => s + (p.progressWeight || 0), 0);
  const phaseWeightNorm = Object.fromEntries(
    template.phases.map(p => [p.id, sumIncluded > 0 ? (p.progressWeight || 0) / sumIncluded : 0])
  );

  return activeWPs.map(wp => {
    const meta = getWPByIdV2(wp.id);
    const zone = retailFitoutV2.zones.find(z => z.id === meta?.zoneId);
    const raw = total_days * (phaseWeightNorm[wp.phaseId] || 0) * wp.duration_pct * sizeModifier;
    const duration_days = Math.max(1, Math.round(raw));

    return {
      id:              wp.id,
      label:           wp.label,
      phaseId:         meta?.zoneId ?? wp.phaseId,
      phaseLabel:      zone?.label ?? meta?.zoneId ?? wp.phaseId,
      categoryId:      wp.phaseId,
      duration_pct:    wp.duration_pct,
      isBlocker:       meta?.isBlocker ?? false,
      defaultLag_days: 0,
      duration_days,
      actual_progress: 0,
      status:          'not_started',
      actual_start:    null,
      actual_end:      null,
      site_visit_progress: null,
      discrepancy_status:  null,
      is_archived:     false,
    };
  });
}

// ─── STEP 1: Kahn's topological sort ─────────────────────────────────────────

function topologicalSort(wps, rules) {
  const ids = new Set(wps.map(w => w.id));
  const activeRules = rules.filter(r => ids.has(r.from) && ids.has(r.to));

  // in-degree and adjacency
  const inDegree = {};
  const successors = {}; // successors[from] = [{to, lag_days}]
  for (const wp of wps) {
    inDegree[wp.id] = 0;
    successors[wp.id] = [];
  }
  for (const r of activeRules) {
    inDegree[r.to] = (inDegree[r.to] || 0) + 1;
    successors[r.from].push({ to: r.to, lag_days: r.lag_days });
  }

  const queue = wps.filter(w => inDegree[w.id] === 0).map(w => w.id);
  const sorted = [];

  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    for (const { to } of successors[cur]) {
      inDegree[to]--;
      if (inDegree[to] === 0) queue.push(to);
    }
  }

  if (sorted.length !== wps.length) {
    const remaining = wps.filter(w => !sorted.includes(w.id)).map(w => w.id);
    throw new Error(`Dependency cycle detected involving: ${remaining.join(', ')}`);
  }

  return sorted; // ordered WP IDs
}

// ─── STEP 2–4: Forward pass, backward pass, float + critical path ────────────

/**
 * Main Gantt calculation.
 *
 * @param {object[]} wps          — from buildProjectWPs()
 * @param {object[]} dependencies — DEPENDENCY_RULES (will be filtered internally)
 * @param {Date|string} projectStart
 * @returns Enriched WP array with earlyStart/earlyFinish/lateStart/lateFinish/float/isCritical
 */
export function calculateGantt(wps, dependencies, projectStart) {
  if (!wps || wps.length === 0) return [];

  const start = toUTCMidnight(projectStart);
  const wpIdSet = new Set(wps.map(w => w.id));
  // BUGFIX: this previously called the v1-only filterRulesForWPs() helper,
  // silently ignoring whatever `dependencies` array was actually passed in
  // (the parameter existed and was even documented as "will be filtered
  // internally", but the body never touched it) — every caller got v1's
  // DEPENDENCY_RULES regardless of what it asked for. v1 always passes
  // DEPENDENCY_RULES here, so this fix is behavior-identical for v1; it's
  // what makes DEPENDENCY_RULES_V2 (or any other template's rules) actually
  // take effect for the first time.
  const rules = dependencies.filter(r => wpIdSet.has(r.from) && wpIdSet.has(r.to));

  // Build predecessor map: predecessors[wpId] = [{from, lag_days}]
  const predecessors = {};
  const successorsMap = {};
  for (const wp of wps) {
    predecessors[wp.id] = [];
    successorsMap[wp.id] = [];
  }
  for (const r of rules) {
    predecessors[r.to].push({ from: r.from, lag_days: r.lag_days });
    successorsMap[r.from].push({ to: r.to, lag_days: r.lag_days });
  }

  // Topological order
  const order = topologicalSort(wps, rules);
  const wpMap = Object.fromEntries(wps.map(w => [w.id, { ...w }]));

  // ── Forward pass ──────────────────────────────────────────────────────────
  const earlyStart  = {};
  const earlyFinish = {};

  for (const id of order) {
    const wp = wpMap[id];
    const preds = predecessors[id];

    if (preds.length === 0) {
      earlyStart[id] = new Date(start);
    } else {
      let maxFinish = new Date(start);
      for (const { from, lag_days } of preds) {
        const candidate = addDays(earlyFinish[from], lag_days);
        if (candidate > maxFinish) maxFinish = candidate;
      }
      earlyStart[id] = maxFinish;
    }
    earlyFinish[id] = addDays(earlyStart[id], wp.duration_days);
  }

  // ── Backward pass ─────────────────────────────────────────────────────────
  const projectEnd = new Date(Math.max(...Object.values(earlyFinish).map(d => d.getTime())));

  const lateFinish = {};
  const lateStart  = {};

  // Process in reverse topological order
  for (const id of [...order].reverse()) {
    const wp = wpMap[id];
    const succs = successorsMap[id];

    if (succs.length === 0) {
      lateFinish[id] = new Date(projectEnd);
    } else {
      let minStart = new Date(projectEnd);
      for (const { to, lag_days } of succs) {
        const candidate = addDays(lateStart[to], -lag_days);
        if (candidate < minStart) minStart = candidate;
      }
      lateFinish[id] = minStart;
    }
    lateStart[id] = addDays(lateFinish[id], -wp.duration_days);
  }

  // ── Float + Critical Path ─────────────────────────────────────────────────
  const result = order.map(id => {
    const wp = wpMap[id];
    const floatDays = diffDays(earlyStart[id], lateStart[id]);
    const isCritical = floatDays <= 0;

    return {
      ...wp,
      earlyStart:  earlyStart[id],
      earlyFinish: earlyFinish[id],
      lateStart:   lateStart[id],
      lateFinish:  lateFinish[id],
      float_days:  Math.max(0, floatDays),
      isCritical,
    };
  });

  return result;
}

// ─── Feasibility check ────────────────────────────────────────────────────────

/**
 * @param {object[]} ganttResult  — from calculateGantt()
 * @param {Date|string} targetOpeningDate
 * @returns {{ feasible, projectedOpeningDate, daysOver, criticalPathLength }}
 */
export function checkFeasibility(ganttResult, targetOpeningDate) {
  if (!ganttResult || ganttResult.length === 0) {
    return { feasible: false, projectedOpeningDate: null, daysOver: 0, criticalPathLength: 0 };
  }

  const target = toUTCMidnight(targetOpeningDate);
  const { projectedOpeningDate } = calculateKeyDates(ganttResult);
  const daysOver = projectedOpeningDate ? diffDays(target, projectedOpeningDate) : 0;
  const criticalPathLength = ganttResult.filter(w => w.isCritical).length;

  return {
    feasible: daysOver <= 0,
    projectedOpeningDate,
    daysOver: Math.max(0, daysOver),
    criticalPathLength,
  };
}

// ─── Key dates ────────────────────────────────────────────────────────────────

/**
 * Derives construction_completion_date and projected_opening_date from Gantt result.
 * @param {object[]} ganttResult
 * @returns {{ constructionCompletionDate: Date, projectedOpeningDate: Date }}
 */
/**
 * @param {object[]} ganttResult
 * @param {string} [completionMarkerId] — WP id treated as "construction complete"
 *   once it finishes; defaults to v1's 'comm.snagging'. Pass the v2 equivalent
 *   ('common.commissioning.integrated_systems_test') for zoned projects.
 * @param {string} [openingMarkerId] — WP id treated as "opening"; defaults to
 *   v1's 'handover.keys'. Pass 'common.handover.keys_possession' for v2.
 * @param {string} [completionPhaseId] — fallback grouping key when
 *   completionMarkerId isn't found; defaults to v1's 'commissioning'
 *   (a phaseId). v2 has no phase with that id, so its callers should pass
 *   null here and rely on the "last WP" fallback below instead — v2's
 *   phaseId is a zone id, not a commissioning-specific marker.
 */
export function calculateKeyDates(ganttResult, completionMarkerId = 'comm.snagging', openingMarkerId = 'handover.keys', completionPhaseId = 'commissioning') {
  if (!ganttResult || ganttResult.length === 0) {
    return { constructionCompletionDate: null, projectedOpeningDate: null };
  }

  // construction completion = earlyFinish of the completion marker WP (or last matching-phase WP)
  let constructionCompletionDate = null;
  const snagging = ganttResult.find(w => w.id === completionMarkerId);
  if (snagging) {
    constructionCompletionDate = snagging.earlyFinish;
  } else if (completionPhaseId) {
    const commWPs = ganttResult
      .filter(w => w.phaseId === completionPhaseId)
      .sort((a, b) => b.earlyFinish - a.earlyFinish);
    if (commWPs.length > 0) constructionCompletionDate = commWPs[0].earlyFinish;
  } else {
    // completionPhaseId explicitly null (v2's calling convention — its
    // phaseId is a zone id, not a commissioning-specific marker) -> fall
    // back to the last-finishing WP overall. v1 always passes a non-null
    // completionPhaseId, so this branch never changes v1 behavior.
    const last = ganttResult.reduce((max, w) =>
      !max || w.earlyFinish > max.earlyFinish ? w : max, null);
    if (last) constructionCompletionDate = last.earlyFinish;
  }

  // projected opening = earlyFinish of the opening marker WP (or last WP)
  let projectedOpeningDate = null;
  const keys = ganttResult.find(w => w.id === openingMarkerId);
  if (keys) {
    projectedOpeningDate = keys.earlyFinish;
  } else {
    const last = ganttResult.reduce((max, w) =>
      !max || w.earlyFinish > max.earlyFinish ? w : max, null);
    if (last) projectedOpeningDate = last.earlyFinish;
  }

  return { constructionCompletionDate, projectedOpeningDate };
}

// ─── Forecast opening ─────────────────────────────────────────────────────────

/**
 * Forecast the opening date based on actual progress data.
 *
 * @param {object[]} ganttResult  — WPs with actual_progress, status, earlyStart, earlyFinish
 * @param {Date|string} today
 * @param {object[]} [dependencyRules]
 * @param {string} [openingMarkerId] — v1's 'handover.keys' (default). Pass
 *   'common.handover.keys_possession' for v2 — same parameterization
 *   calculateKeyDates() already uses, kept in sync (engine-audit fix,
 *   2026-07-16: this hardcoded the v1 id with no way to override it, unlike
 *   its sibling; not exploitable today since this function has no live
 *   caller, but would silently mis-forecast if one is ever wired up for v2
 *   without this).
 * @returns {{ forecastOpeningDate: Date, confidence: "high"|"medium"|"low" }}
 */
export function calculateForecastOpening(ganttResult, today, dependencyRules = DEPENDENCY_RULES, openingMarkerId = 'handover.keys') {
  if (!ganttResult || ganttResult.length === 0) {
    return { forecastOpeningDate: null, confidence: 'low' };
  }

  const now = toUTCMidnight(today || new Date());

  // Count WPs with actual data
  const wpsWithData = ganttResult.filter(w =>
    w.actual_progress > 0 || w.status === 'completed'
  );
  const dataRatio = wpsWithData.length / ganttResult.length;
  const confidence = dataRatio >= 0.5 ? 'high' : dataRatio >= 0.2 ? 'medium' : 'low';

  // If no actual progress: return planned projected opening
  if (wpsWithData.length === 0) {
    const { projectedOpeningDate } = calculateKeyDates(ganttResult, undefined, openingMarkerId);
    return { forecastOpeningDate: projectedOpeningDate, confidence: 'low' };
  }

  // Build forecast finish per WP
  const forecastFinish = {};

  for (const wp of ganttResult) {
    if (wp.status === 'completed' && wp.actual_end) {
      forecastFinish[wp.id] = toUTCMidnight(wp.actual_end);
      continue;
    }
    if (wp.status === 'completed') {
      forecastFinish[wp.id] = wp.earlyFinish;
      continue;
    }

    const progress = wp.actual_progress || 0;
    const remaining = 100 - progress;

    if (progress === 0) {
      // Not started — keep planned duration from when it was supposed to start
      forecastFinish[wp.id] = addDays(wp.earlyStart < now ? now : wp.earlyStart, wp.duration_days);
      continue;
    }

    // In progress: compute velocity
    const actualStart = wp.actual_start
      ? toUTCMidnight(wp.actual_start)
      : (wp.earlyStart < now ? wp.earlyStart : now);
    const daysElapsed = Math.max(1, diffDays(actualStart, now));
    const velocity = progress / daysElapsed; // % per day
    const effectiveVelocity = velocity > 0
      ? velocity
      : 100 / Math.max(1, wp.duration_days);

    const daysToFinish = remaining / effectiveVelocity;
    forecastFinish[wp.id] = addDays(now, Math.ceil(daysToFinish));
  }

  // Re-run forward pass with forecast finishes as earlyFinish overrides.
  // BUGFIX (see calculateGantt's note above): was hardcoded to v1's rules
  // regardless of template; v1 always effectively used DEPENDENCY_RULES, so
  // the default preserves it exactly.
  const wpIdSet = new Set(ganttResult.map(w => w.id));
  const rules = dependencyRules.filter(r => wpIdSet.has(r.from) && wpIdSet.has(r.to));

  const predecessorsMap = {};
  for (const wp of ganttResult) predecessorsMap[wp.id] = [];
  for (const r of rules) {
    predecessorsMap[r.to].push({ from: r.from, lag_days: r.lag_days });
  }

  // Topological order (use same as ganttResult order which is already sorted)
  const forecastStart = {};
  const reforecastFinish = {};

  for (const wp of ganttResult) {
    const preds = predecessorsMap[wp.id];
    let start;

    if (preds.length === 0) {
      start = wp.earlyStart < now ? now : wp.earlyStart;
    } else {
      let maxFinish = new Date(0);
      for (const { from, lag_days } of preds) {
        const candidate = addDays(reforecastFinish[from] || wp.earlyFinish, lag_days);
        if (candidate > maxFinish) maxFinish = candidate;
      }
      start = maxFinish;
    }

    forecastStart[wp.id] = start;

    if (wp.status === 'completed') {
      reforecastFinish[wp.id] = forecastFinish[wp.id] || wp.earlyFinish;
    } else {
      // Shift by delta vs original plan
      const plannedDuration = wp.duration_days;
      reforecastFinish[wp.id] = addDays(start, plannedDuration);
    }

    // Take max of dependency-driven finish and our individual forecast
    const individual = forecastFinish[wp.id];
    if (individual && individual > reforecastFinish[wp.id]) {
      reforecastFinish[wp.id] = individual;
    }
  }

  // Keys WP
  const keysWP = ganttResult.find(w => w.id === openingMarkerId);
  let forecastOpeningDate;
  if (keysWP && reforecastFinish[openingMarkerId]) {
    forecastOpeningDate = reforecastFinish[openingMarkerId];
  } else {
    // Fall back to latest reforecast finish
    const dates = Object.values(reforecastFinish).filter(Boolean);
    forecastOpeningDate = dates.length > 0
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : null;
  }

  return { forecastOpeningDate, confidence };
}

// ─── Delay propagation ────────────────────────────────────────────────────────

/**
 * Recalculate Gantt after a delay on a specific WP.
 *
 * @param {object[]} ganttResult
 * @param {string} delayedWPId
 * @param {number} newProgressPct   — actual progress (0–100)
 * @param {Date|string} today
 * @returns Updated ganttResult with recalculated dates
 */
export function recalculateOnDelay(ganttResult, delayedWPId, newProgressPct, today, dependencyRules = DEPENDENCY_RULES) {
  const now = toUTCMidnight(today || new Date());

  const updated = ganttResult.map(wp => {
    if (wp.id !== delayedWPId) return wp;
    return { ...wp, actual_progress: newProgressPct };
  });

  const delayedWP = updated.find(w => w.id === delayedWPId);
  if (!delayedWP) return ganttResult;

  // Estimate new finish for the delayed WP
  const remaining = 100 - newProgressPct;
  const actualStart = delayedWP.actual_start
    ? toUTCMidnight(delayedWP.actual_start)
    : delayedWP.earlyStart;
  const daysElapsed = Math.max(1, diffDays(actualStart, now));
  const velocity = newProgressPct > 0
    ? newProgressPct / daysElapsed
    : 100 / delayedWP.duration_days;
  const daysToFinish = Math.ceil(remaining / velocity);
  const newFinish = addDays(now, daysToFinish);

  // Build new WP list with updated earlyFinish for delayed WP
  const wpMap = {};
  for (const wp of updated) wpMap[wp.id] = { ...wp };
  wpMap[delayedWPId].earlyFinish = newFinish;
  wpMap[delayedWPId].status = newProgressPct >= 100 ? 'completed' : 'delayed';

  // Propagate: forward pass over all dependents.
  // BUGFIX (see calculateGantt's note above): was hardcoded to v1's rules
  // regardless of template; default preserves v1 behavior exactly.
  const wpIdSet = new Set(updated.map(w => w.id));
  const rules = dependencyRules.filter(r => wpIdSet.has(r.from) && wpIdSet.has(r.to));
  const successorsMap = {};
  const predecessorsMap = {};
  for (const wp of updated) {
    successorsMap[wp.id] = [];
    predecessorsMap[wp.id] = [];
  }
  for (const r of rules) {
    successorsMap[r.from].push({ to: r.to, lag_days: r.lag_days });
    predecessorsMap[r.to].push({ from: r.from, lag_days: r.lag_days });
  }

  // BFS from delayedWPId
  const queue = [delayedWPId];
  const visited = new Set([delayedWPId]);

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const { to } of successorsMap[cur]) {
      // Recalculate earlyStart for successor as max of all predecessor earlyFinish + lag
      const preds = predecessorsMap[to];
      let maxFinish = new Date(0);
      for (const { from, lag_days: lag } of preds) {
        const ef = wpMap[from]?.earlyFinish || new Date(0);
        const candidate = addDays(ef, lag);
        if (candidate > maxFinish) maxFinish = candidate;
      }
      const newEarlyStart = maxFinish;
      const newEarlyFinish = addDays(newEarlyStart, wpMap[to].duration_days);
      wpMap[to].earlyStart = newEarlyStart;
      wpMap[to].earlyFinish = newEarlyFinish;

      if (!visited.has(to)) {
        visited.add(to);
        queue.push(to);
      }
    }
  }

  // Re-run backward pass to update critical path
  const result = Object.values(wpMap);
  const projectEnd = new Date(Math.max(...result.map(w => w.earlyFinish.getTime())));

  const lateFinish = {};
  const lateStart  = {};
  const reverseOrder = [...result].sort((a, b) => b.earlyFinish - a.earlyFinish);

  for (const wp of reverseOrder) {
    const succs = successorsMap[wp.id];
    if (succs.length === 0) {
      lateFinish[wp.id] = new Date(projectEnd);
    } else {
      let minStart = new Date(projectEnd);
      for (const { to, lag_days } of succs) {
        const candidate = addDays(lateStart[to] || projectEnd, -lag_days);
        if (candidate < minStart) minStart = candidate;
      }
      lateFinish[wp.id] = minStart;
    }
    lateStart[wp.id] = addDays(lateFinish[wp.id], -wp.duration_days);
  }

  return result.map(wp => {
    const floatDays = diffDays(wp.earlyStart, lateStart[wp.id]);
    return {
      ...wp,
      lateStart:  lateStart[wp.id],
      lateFinish: lateFinish[wp.id],
      float_days: Math.max(0, floatDays),
      isCritical: floatDays <= 0,
    };
  });
}

// ─── Utilities (exported for tests) ──────────────────────────────────────────

export { addDays, diffDays, toUTCMidnight };
