// Gantt Layout Engine — pure geometry/layout calculations, no React.
// Converts ganttResult into pixel positions for the SVG renderer.

import { filterRulesForWPs } from '../config/dependencyRules.js';
import { V2_TEMPLATE_TYPE } from '../domains/construction/templates/retailFitoutV2.js';
import { resolveProjectScopeTemplate } from '../domains/construction/templates/versionedScopeTemplate.js';
import { diffDays } from './dateMath.js';

// Re-exported (not redefined) so existing consumers of this module
// (core/presentation/ganttLayoutModel.js -> hooks/useGanttLayout.js ->
// GanttChart.jsx, and this module's own test file) keep working unchanged —
// diffDays now lives in the neutral dateMath.js, since it's generic date
// arithmetic, not Gantt-layout-specific geometry. There is still exactly one
// implementation.
export { diffDays };

const ROW_HEIGHT    = 36;   // px per WP row
const PHASE_ROW_H   = 32;   // px per phase header row
const BAR_HEIGHT    = 22;   // px bar height within row
export const MIN_PIXELS = 600;  // minimum chart width — also GanttChart.jsx's ResizeObserver floor

// ─── Timeline helpers ─────────────────────────────────────────────────────────

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Mouse-drag pixel delta converted to whole days at the chart's current zoom. */
export function pixelsToDays(pixelDelta, pixelsPerDay) {
  return Math.round(pixelDelta / pixelsPerDay);
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day); // Sunday
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Main layout calculator ───────────────────────────────────────────────────

/**
 * @param {object[]} ganttResult    — from calculateGantt()
 * @param {string} viewMode         — "month" | "week" | "day"
 * @param {number} containerWidth   — available chart width in px
 * @param {object} keyDates         — { targetOpeningDate, constructionCompletionDate, forecastOpeningDate }
 * @param {object[]} discrepancies  — from discrepancyEngine
 * @param {object} [collapseState]  — { [phaseId]: boolean } — true = collapsed
 * @param {string|null} [templateType] — project.templateType; selects which
 *   dependency-rule set buildArrows() filters against (v1 default vs v2 when
 *   this equals V2_TEMPLATE_TYPE). Omitted/anything else = v1, unchanged.
 * @returns Full layout object
 */
export function calculateLayout(
  ganttResult,
  viewMode = 'month',
  containerWidth = 900,
  keyDates = {},
  discrepancies = [],
  collapseState = {},
  projectOrTemplateType = null
) {
  if (!ganttResult || ganttResult.length === 0) return null;

  const discMap = Object.fromEntries((discrepancies || []).map(d => [d.wpId, d]));

  // ── Timeline bounds ── anchor to construction dates when provided ────────
  let timelineStart, timelineEnd;
  if (keyDates.constructionStartDate && keyDates.constructionEndDate) {
    timelineStart = addDays(new Date(keyDates.constructionStartDate), -2);
    timelineEnd   = addDays(new Date(keyDates.constructionEndDate),    5);
  } else {
    // Unscheduled WPs (earlyStart/earlyFinish null) must never enter the
    // timeline-bounds computation — a null here is not "no opinion", it's
    // "no date at all", so it is filtered out rather than coerced.
    const allDates = ganttResult
      .flatMap(w => [w.earlyStart, w.earlyFinish])
      .filter(d => d != null);
    if (keyDates.targetOpeningDate)          allDates.push(new Date(keyDates.targetOpeningDate));
    if (keyDates.constructionCompletionDate) allDates.push(new Date(keyDates.constructionCompletionDate));
    if (keyDates.forecastOpeningDate)        allDates.push(new Date(keyDates.forecastOpeningDate));
    // Nothing scheduled at all (e.g. a fully-unscheduled workspace) — fall
    // back to a small window anchored on today rather than Math.min/max of
    // an empty array (which would yield Infinity/-Infinity → Invalid Date).
    // This is a chart-viewport default, not a fabricated task date.
    if (allDates.length === 0) {
      const today = new Date();
      timelineStart = addDays(today, -2);
      timelineEnd   = addDays(today, 5);
    } else {
      const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
      timelineStart = addDays(minDate, -2);
      timelineEnd   = addDays(maxDate, 5);
    }
  }
  const totalDays = diffDays(timelineStart, timelineEnd);

  const chartWidth = Math.max(MIN_PIXELS, containerWidth);
  const pixelsPerDay = chartWidth / totalDays;

  function dateToX(date) {
    return diffDays(timelineStart, date) * pixelsPerDay;
  }

  // ── Group WPs by phase ──────────────────────────────────────────────────
  const phaseMap = {};
  for (const wp of ganttResult) {
    if (!phaseMap[wp.phaseId]) {
      phaseMap[wp.phaseId] = {
        id:         wp.phaseId,
        label:      wp.phaseLabel,
        phaseOrder: wp.phaseOrder,
        wps:        [],
      };
    }
    phaseMap[wp.phaseId].wps.push(wp);
  }
  const phaseGroups = Object.values(phaseMap).sort((a, b) => a.phaseOrder - b.phaseOrder);

  // ── Row positions ────────────────────────────────────────────────────────
  const phases = [];
  const tasks  = [];
  let rowIndex = 0;

  for (const phase of phaseGroups) {
    const isCollapsed = !!collapseState[phase.id];
    const phaseY = rowIndex * ROW_HEIGHT;

    if (isCollapsed) {
      // Phase header only — show summary bar
      phases.push({ ...phase, y: phaseY, height: PHASE_ROW_H, isCollapsed: true });
      rowIndex++;
    } else {
      phases.push({
        ...phase,
        y: phaseY,
        height: PHASE_ROW_H + phase.wps.length * ROW_HEIGHT,
        isCollapsed: false,
      });
      rowIndex++; // phase header row

      for (const wp of phase.wps) {
        const y = rowIndex * ROW_HEIGHT;
        // hasSchedule is the one canonical flag consumers (GanttChart.jsx,
        // buildArrows below) must check before treating x/width as real bar
        // geometry — an unscheduled WP still gets a row (label, status), but
        // no bar and no dependency arrow, and no epoch/fake date stands in
        // for its missing planned_start/planned_end.
        const hasSchedule = wp.earlyStart != null && wp.earlyFinish != null && wp.duration_days != null;
        const x = hasSchedule ? dateToX(wp.earlyStart) : null;
        const width = hasSchedule ? Math.max(2, wp.duration_days * pixelsPerDay) : 0;
        const discrepancy = discMap[wp.id] || null;

        tasks.push({
          ...wp,
          x,
          y,
          width,
          hasSchedule,
          barY:        y + (ROW_HEIGHT - BAR_HEIGHT) / 2,
          barHeight:   BAR_HEIGHT,
          rowIndex,
          discrepancy,
        });
        rowIndex++;
      }
    }
  }

  const totalHeight = rowIndex * ROW_HEIGHT;

  // ── Timeline headers ─────────────────────────────────────────────────────
  const timelineHeaders = buildTimelineHeaders(timelineStart, timelineEnd, viewMode, dateToX, pixelsPerDay);

  // ── Dependency arrows ────────────────────────────────────────────────────
  const templateType = typeof projectOrTemplateType === 'string'
    ? projectOrTemplateType
    : projectOrTemplateType?.templateType;
  const scopeTemplate = templateType === V2_TEMPLATE_TYPE
    ? resolveProjectScopeTemplate(
        typeof projectOrTemplateType === 'string'
          ? { templateType }
          : projectOrTemplateType
      )
    : null;
  const arrows = buildArrows(tasks, ganttResult, scopeTemplate?.dependencies ?? null);

  // ── Key date vertical lines ──────────────────────────────────────────────
  const keyDateLines = buildKeyDateLines(keyDates, dateToX);

  return {
    timelineStart,
    timelineEnd,
    totalDays,
    pixelsPerDay,
    chartWidth,
    totalHeight,
    phases,
    tasks,
    arrows,
    timelineHeaders,
    keyDateLines,
    ROW_HEIGHT,
    PHASE_ROW_H,
    BAR_HEIGHT,
  };
}

// ─── Timeline headers ─────────────────────────────────────────────────────────

function buildTimelineHeaders(timelineStart, timelineEnd, viewMode, dateToX, pixelsPerDay) {
  const headers = [];

  if (viewMode === 'month') {
    let cur = startOfMonth(timelineStart);
    while (cur <= timelineEnd) {
      const next = startOfMonth(addDays(cur, 32));
      next.setUTCDate(1);
      const x = dateToX(cur);
      const width = dateToX(next) - x;
      const label = `${MONTHS[cur.getUTCMonth()]} ${cur.getUTCFullYear()}`;
      headers.push({ label, x, width });
      cur = next;
    }
  } else if (viewMode === 'week') {
    let cur = startOfWeek(timelineStart);
    while (cur <= timelineEnd) {
      const next = addDays(cur, 7);
      const x = dateToX(cur);
      const width = 7 * pixelsPerDay;
      const d = cur.getUTCDate();
      const m = MONTHS[cur.getUTCMonth()];
      headers.push({ label: `${d} ${m}`, x, width });
      cur = next;
    }
  } else {
    // day view
    let cur = new Date(timelineStart);
    while (cur <= timelineEnd) {
      const x = dateToX(cur);
      const d = cur.getUTCDate();
      const m = MONTHS[cur.getUTCMonth()];
      headers.push({ label: `${d} ${m}`, x, width: pixelsPerDay });
      cur = addDays(cur, 1);
    }
  }

  return headers;
}

// ─── Dependency arrows ────────────────────────────────────────────────────────

function buildArrows(tasks, ganttResult, versionedDependencies = null) {
  const wpIds = ganttResult.map(w => w.id);
  // F-11: pick the dependency-rule set matching this project's template —
  // was previously always the v1 set, so a v2 project's WP ids never
  // matched any rule and zero arrows were ever drawn.
  const wpIdSet = new Set(wpIds);
  const rules = versionedDependencies
    ? versionedDependencies.filter(rule => wpIdSet.has(rule.from) && wpIdSet.has(rule.to))
    : filterRulesForWPs(wpIds);
  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));

  const arrows = [];
  for (const rule of rules) {
    const from = taskMap[rule.from];
    const to   = taskMap[rule.to];
    if (!from || !to) continue;
    // An unscheduled endpoint has no real x/width — drawing an arrow to/from
    // it would either use the null-position fallback or a stale one, both
    // misleading. No dependency line for a task with no schedule yet.
    if (!from.hasSchedule || !to.hasSchedule) continue;

    const path = generateArrowPath(from, to);
    arrows.push({
      fromWPId: rule.from,
      toWPId:   rule.to,
      isCritical: !!(from.isCritical && to.isCritical),
      path,
    });
  }
  return arrows;
}

// ─── Arrow path generator ─────────────────────────────────────────────────────

/**
 * Generate an SVG cubic bezier path from fromWP's right edge to toWP's left edge.
 * Routes below bars if toWP starts before fromWP finishes.
 */
export function generateArrowPath(fromWP, toWP) {
  const fromX = fromWP.x + fromWP.width;
  const fromY = fromWP.barY + fromWP.barHeight / 2;
  const toX   = toWP.x;
  const toY   = toWP.barY + toWP.barHeight / 2;

  const cp1x = fromX + Math.min(40, Math.abs(toX - fromX) / 2);
  const cp2x = toX   - Math.min(40, Math.abs(toX - fromX) / 2);

  if (toX >= fromX) {
    // Normal: straight cubic bezier
    return `M ${fromX} ${fromY} C ${cp1x} ${fromY} ${cp2x} ${toY} ${toX} ${toY}`;
  } else {
    // Route below — go down, then across, then up
    const belowY = Math.max(fromY, toY) + 16;
    return [
      `M ${fromX} ${fromY}`,
      `L ${fromX + 12} ${fromY}`,
      `L ${fromX + 12} ${belowY}`,
      `L ${toX - 12} ${belowY}`,
      `L ${toX - 12} ${toY}`,
      `L ${toX} ${toY}`,
    ].join(' ');
  }
}

// ─── Key date vertical lines ──────────────────────────────────────────────────

function buildKeyDateLines(keyDates, dateToX) {
  const lines = [];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  lines.push({
    type:  'today',
    date:  today,
    x:     dateToX(today),
    label: 'Today',
    color: 'var(--text-muted)',
    style: 'dashed',
  });

  if (keyDates.targetOpeningDate) {
    lines.push({
      type:  'target_opening',
      date:  new Date(keyDates.targetOpeningDate),
      x:     dateToX(new Date(keyDates.targetOpeningDate)),
      label: 'Target Opening',
      color: 'var(--accent)',
      style: 'solid',
    });
  }

  if (keyDates.constructionCompletionDate) {
    lines.push({
      type:  'construction_completion',
      date:  new Date(keyDates.constructionCompletionDate),
      x:     dateToX(new Date(keyDates.constructionCompletionDate)),
      label: 'Construction Complete',
      color: 'var(--status-done)',
      style: 'solid',
    });
  }

  if (keyDates.forecastOpeningDate) {
    const forecastX = dateToX(new Date(keyDates.forecastOpeningDate));
    const targetX   = keyDates.targetOpeningDate
      ? dateToX(new Date(keyDates.targetOpeningDate))
      : null;

    // If forecast == target: show single blue line labeled "On Track ✓"
    const onTrack = targetX !== null && Math.abs(forecastX - targetX) < 2;
    if (onTrack) {
      // Update target label
      const t = lines.find(l => l.type === 'target_opening');
      if (t) t.label = 'On Track ✓';
    } else {
      lines.push({
        type:  'forecast_opening',
        date:  new Date(keyDates.forecastOpeningDate),
        x:     forecastX,
        label: 'Forecast Opening',
        color: 'var(--status-warn)',
        style: 'dashed',
      });
    }
  }

  return lines;
}
