import { constructionRetailV1 } from "../domains/construction/templates/constructionRetailV1";
import { DEPENDENCY_RULES } from "../config/dependencyRules";
import { daysUntil } from "../utils/reportUtils";
import { sortReasons } from "../utils/reasonUtils";

// Flat WP list across all phases (canonical source — Wave 4.5).
const ALL_WPS = constructionRetailV1.phases.flatMap(phase =>
  phase.workPackages.map(wp => ({ ...wp, phaseId: phase.id }))
);
const ALL_WP_IDS = ALL_WPS.map(wp => wp.id);

// All opening-blocker WPs (critical + soft), keyed by their real wp.id — not just
// phaseId/label. A2 (2026-07-06): the previous version only kept phaseId+label,
// which is enough to look up a task's reported status (wpCumulativeStatuses is
// phase/label-keyed) but loses the wp.id dependencyRules.js needs to place a
// blocker in the schedule graph. Both are carried here.
const BLOCKER_WPS = ALL_WPS.filter(wp => wp.openingBlocker === 'critical' || wp.openingBlocker === 'soft');

function getTaskEntry(wpStatuses, wp) {
  return wpStatuses?.[wp.phaseId]?.[wp.label] || null;
}

// A2: null/undefined status (task never touched by any report) now counts as
// blocking — same as an explicit "Not Started". The previous version treated
// "no report has mentioned this WP yet" as "nothing to flag", which silently
// hid not-yet-started blockers (and understated required close-out time) for
// any project where the contractor hadn't reached that phase in their reports
// yet, even though the WP still fully needs doing before opening.
function isBlocking(entry) {
  const status = entry?.status;
  if (status === 'Not Applicable') return false;
  return status !== 'Completed';
}

// How many days of typicalClearDays are left on one blocker, given its reported
// progress. "In Progress" gets partial credit; never-reported/'Not Started'
// gets the full typical duration; 'Completed' is already filtered out by
// isBlocking() before this is called.
function remainingClearDays(wp, entry) {
  const clearDays = wp.typicalClearDays ?? 0;
  const progress = Math.max(0, Math.min(100, entry?.progress ?? 0));
  return clearDays * (1 - progress / 100);
}

// A3 follow-up: BLOCKER_WPS is the FULL canonical constructionRetailV1 list —
// a project whose scope (getScopeWPIds) excludes a blocker WP never reports
// on it, so getTaskEntry() always returns null and isBlocking(null) is always
// true. Without scoping here, an out-of-scope blocker WP is flagged as
// perpetually incomplete forever, even on a project that's 92% done and
// ahead of schedule. computeCriticalChain() already receives scopeWPIds for
// the same reason — this must match, or its graph would be scoped while the
// blocker list feeding it isn't.
function buildBlockerRecords(wpStatuses, scopeWPIds = null, blockerWPs = BLOCKER_WPS) {
  const inScope = scopeWPIds && scopeWPIds.length
    ? (wp) => scopeWPIds.includes(wp.id)
    : () => true;
  const records = [];
  for (const wp of blockerWPs) {
    if (!inScope(wp)) continue;
    const entry = getTaskEntry(wpStatuses, wp);
    if (!isBlocking(entry)) continue;
    records.push({
      wpId: wp.id,
      phaseId: wp.phaseId,
      task: wp.label,
      level: wp.openingBlocker,
      status: entry?.status || 'Not Started',
      responsibleRole: wp.responsibleRole || null,
      remainingDays: Math.round(remainingClearDays(wp, entry) * 10) / 10,
    });
  }
  return records;
}

// Longest-path (critical-path-method style) over the dependency DAG, weighting
// only unfinished blocker WPs by their remainingDays — non-blocker WPs are
// zero-weight pass-through nodes, kept only so two blockers on either side of
// them are still correctly sequenced (see the audit: several blockers connect
// only THROUGH non-blocker WPs, e.g. test.electrical -> walls.closing ->
// finish.walls -> devices.lighting, so a direct blocker-to-blocker edge scan
// would miss that they're actually in the same chain).
//
// requiredDays = the longest weighted path through the graph = the real
// bottleneck across all independent/parallel blocker chains at once — this
// subsumes the "max over independent chains" framing without needing to
// separately detect which chains are independent.
function computeCriticalChain(blockerRecords, scopeWPIds, allWpIds = ALL_WP_IDS, dependencyRules = DEPENDENCY_RULES) {
  if (blockerRecords.length === 0) return { requiredDays: 0, criticalChain: [] };

  const byWpId = Object.fromEntries(blockerRecords.map(b => [b.wpId, b]));
  const nodeIds = scopeWPIds && scopeWPIds.length ? scopeWPIds : allWpIds;
  const wpIdSet = new Set(nodeIds);
  const rules = scopeWPIds && scopeWPIds.length
    ? dependencyRules.filter(r => wpIdSet.has(r.from) && wpIdSet.has(r.to))
    : dependencyRules;

  const predecessors = {};
  for (const id of nodeIds) predecessors[id] = [];
  for (const rule of rules) {
    if (!(rule.to in predecessors)) predecessors[rule.to] = [];
    predecessors[rule.to].push(rule.from);
  }

  const weight = (id) => byWpId[id]?.remainingDays ?? 0;

  const memo = {};
  const visiting = new Set(); // defensive cycle guard — DEPENDENCY_RULES should always be a DAG
  function longestPathTo(id) {
    if (memo[id] != null) return memo[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const preds = predecessors[id] || [];
    const bestPred = preds.length ? Math.max(...preds.map(longestPathTo)) : 0;
    const dist = bestPred + weight(id);
    visiting.delete(id);
    memo[id] = dist;
    return dist;
  }

  let requiredDays = 0;
  let bottleneckId = null;
  for (const id of nodeIds) {
    const dist = longestPathTo(id);
    if (dist > requiredDays) { requiredDays = dist; bottleneckId = id; }
  }

  // Reconstruct the actual sequence of blockers on that longest path, walking
  // backwards from the bottleneck through whichever predecessor achieved the max.
  const chainIds = [];
  let cur = bottleneckId;
  while (cur != null) {
    if (byWpId[cur]) chainIds.push(cur);
    const preds = predecessors[cur] || [];
    if (!preds.length) break;
    const target = memo[cur] - weight(cur);
    cur = preds.find(p => longestPathTo(p) === target) ?? null;
  }
  chainIds.reverse();

  return {
    requiredDays: Math.round(requiredDays * 10) / 10,
    criticalChain: chainIds.map(id => byWpId[id]),
  };
}

function computeVerdict(daysToOpening, requiredDays) {
  if (daysToOpening == null) return { slack: null, verdict: null };
  const slack = Math.round((daysToOpening - requiredDays) * 10) / 10;
  const verdict = slack >= 7 ? 'READY_TRACK' : slack >= 0 ? 'TIGHT' : 'NOT_ACHIEVABLE';
  return { slack, verdict };
}

/**
 * Compute opening readiness from latest cumulative WP statuses.
 *
 * @param {object|null}  wpCumulativeStatuses  - merged workPackageStatuses object
 * @param {string|null}  targetOpeningDate     - ISO date string
 * @param {string[]|null} [scopeWPIds]         - project's active WP ids (getScopeWPIds output);
 *   null/omitted falls back to the full template graph, unscoped.
 * @param {{blockerWPs?: object[], allWpIds?: string[], dependencyRules?: object[]}|null} [templateOptions]
 *   - override the v1 constructionRetailV1/DEPENDENCY_RULES defaults below
 *   (used by v2 zoned projects — see buildV2OpeningReadinessOptions in
 *   retailFitoutV2 wiring). Omitted entirely for v1, so v1 behavior is
 *   byte-identical to before this parameter existed.
 * @returns {{
 *   status: 'No Date' | 'Ready' | 'At Risk' | 'Critical' | 'Overdue',
 *   daysToOpening: number | null,
 *   targetDate: string | null,
 *   criticalBlockers: Array<{ wpId, task, status }>,
 *   softBlockers: Array<{ wpId, task, status }>,
 *   blockerCount: number,
 *   requiredDays: number,
 *   slack: number | null,
 *   verdict: 'READY_TRACK' | 'TIGHT' | 'NOT_ACHIEVABLE' | null,
 *   criticalChain: Array<{ wpId, phaseId, task, level, status, responsibleRole, remainingDays }>,
 * }}
 */
export function computeOpeningReadiness(wpCumulativeStatuses, targetOpeningDate, scopeWPIds = null, templateOptions = null) {
  const targetDate = targetOpeningDate || null;
  const daysToOpening = targetDate ? daysUntil(targetDate) : null;
  const wpStatuses = wpCumulativeStatuses?.workPackageStatuses ?? wpCumulativeStatuses ?? null;

  const blockerWPs = templateOptions?.blockerWPs ?? BLOCKER_WPS;
  const allWpIds = templateOptions?.allWpIds ?? ALL_WP_IDS;
  const dependencyRules = templateOptions?.dependencyRules ?? DEPENDENCY_RULES;

  const blockerRecords = buildBlockerRecords(wpStatuses, scopeWPIds, blockerWPs);
  // Kept in the original {wpId: phaseId, task, status} shape for existing
  // consumers (commandEngine.js, projectSummaryEngine.js) — only .length is
  // read externally today. The corrected wp.id-keyed data lives in criticalChain.
  const criticalBlockers = blockerRecords.filter(b => b.level === 'critical')
    .map(b => ({ wpId: b.phaseId, task: b.task, status: b.status }));
  const softBlockers = blockerRecords.filter(b => b.level === 'soft')
    .map(b => ({ wpId: b.phaseId, task: b.task, status: b.status }));

  const { requiredDays, criticalChain } = computeCriticalChain(blockerRecords, scopeWPIds, allWpIds, dependencyRules);
  const { slack, verdict } = computeVerdict(daysToOpening, requiredDays);

  // Determine status (unchanged thresholds from before A2 — only the blocker
  // list feeding them is now more complete, per the isBlocking() fix above).
  let status;

  if (daysToOpening === null) {
    status = 'No Date';
  } else if (daysToOpening < 0) {
    status = 'Overdue';
  } else if (criticalBlockers.length > 0 && daysToOpening < 60) {
    status = 'Critical';
  } else if ((criticalBlockers.length > 0 || softBlockers.length > 2) && daysToOpening < 90) {
    status = 'At Risk';
  } else if (criticalBlockers.length > 0 || softBlockers.length > 0) {
    // Blockers exist but opening is far enough away — still flag At Risk
    status = daysToOpening < 120 ? 'At Risk' : 'Ready';
  } else {
    status = 'Ready';
  }

  // Running out of runway is definitionally critical, regardless of where the
  // day-threshold heuristics above land.
  if (verdict === 'NOT_ACHIEVABLE' && status !== 'Overdue') {
    status = 'Critical';
  }

  const reasons = [];

  if (status === 'No Date') {
    reasons.push({ type: 'neutral', text: 'No target opening date set', source: 'schedule' });
  } else if (status === 'Overdue') {
    reasons.push({ type: 'critical', text: `Opening date overdue by ${Math.abs(daysToOpening)}d`, source: 'schedule' });
  } else if (verdict === 'NOT_ACHIEVABLE') {
    reasons.push({ type: 'critical', text: `Not achievable — needs ~${Math.ceil(requiredDays)}d to close remaining blockers, only ${daysToOpening}d left (short by ${Math.ceil(-slack)}d)`, source: 'schedule' });
  } else if (verdict === 'TIGHT') {
    reasons.push({ type: 'warning', text: `Tight — needs ~${Math.ceil(requiredDays)}d to close remaining blockers, ${daysToOpening}d left`, source: 'schedule' });
  } else if (status === 'Critical') {
    reasons.push({ type: 'critical', text: `Critical opening: ${daysToOpening}d remaining`, source: 'schedule' });
  } else if (status === 'At Risk') {
    reasons.push({ type: 'warning', text: `Opening date at risk — ${daysToOpening}d remaining`, source: 'schedule' });
  } else {
    reasons.push({ type: 'positive', text: `Opening on track — ${daysToOpening}d remaining`, source: 'schedule' });
  }

  for (const b of criticalBlockers) {
    reasons.push({ type: 'critical', text: `Blocker: ${b.task} (${b.status})`, source: 'blocker' });
  }
  for (const b of softBlockers) {
    reasons.push({ type: 'warning', text: `Soft blocker: ${b.task} (${b.status})`, source: 'blocker' });
  }
  if (criticalBlockers.length === 0 && softBlockers.length === 0 && status !== 'No Date') {
    reasons.push({ type: 'positive', text: 'No critical path blockers', source: 'blocker' });
  }

  return {
    status,
    daysToOpening,
    targetDate,
    criticalBlockers,
    softBlockers,
    blockerCount: criticalBlockers.length + softBlockers.length,
    requiredDays,
    slack,
    verdict,
    criticalChain,
    reasons: sortReasons(reasons),
  };
}
