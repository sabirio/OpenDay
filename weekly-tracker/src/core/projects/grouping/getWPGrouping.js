import { getWPById, getPhaseById } from '../../../config/masterTaskLibrary.js';
import { getWPByIdV2, retailFitoutV2, CATEGORY_LIBRARY, ALL_WORK_PACKAGES_V2, V2_TEMPLATE_TYPE } from '../../../domains/construction/templates/retailFitoutV2.js';
import { getScopeWPIds } from '../scope/getScopeWPIds.js';

/**
 * Single source of truth for "how should this work package's row be
 * grouped/labelled in a form?" — v1 groups by phase (masterTaskLibrary.js),
 * v2 groups by zone -> category (retailFitoutV2.js). Grouping is NEVER
 * stored in the DB (project_gantt_tasks carries only wp_id + a
 * backward-compat phase_id/phase_label pair — see ganttService.js's v2
 * seeding note) — every consumer (WorkPackageProgressSection.jsx,
 * SiteVisitFormView.jsx, contractorReportAdapter.js) calls this instead of
 * trusting a stored label, so template changes only ever need editing here.
 *
 * @param {string|null|undefined} templateType — project.templateType
 * @param {string} wpId
 * @returns {{ zoneId: string, zoneLabel: string, categoryId: string, categoryLabel: string }
 *         | { phaseId: string, phaseLabel: string }
 *         | null} null when wpId isn't found in the resolved template at all
 */
export function getWPGrouping(templateType, wpId) {
  if (templateType === V2_TEMPLATE_TYPE) {
    const wp = getWPByIdV2(wpId);
    if (!wp) return null;
    const zone = retailFitoutV2.zones.find(z => z.id === wp.zoneId);
    const category = CATEGORY_LIBRARY[wp.categoryId];
    return {
      zoneId: wp.zoneId,
      zoneLabel: zone?.label ?? wp.zoneId,
      categoryId: wp.categoryId,
      categoryLabel: category?.label ?? wp.categoryId,
    };
  }

  const wp = getWPById(wpId);
  if (!wp) return null;
  const phase = getPhaseById(wp.phaseId);
  return {
    phaseId: wp.phaseId,
    phaseLabel: phase?.label ?? wp.phaseId,
  };
}

/** True when a templateType uses the zoned v1-incompatible grouping model. */
export function isZonedTemplate(templateType) {
  return templateType === V2_TEMPLATE_TYPE;
}

/**
 * v2 (zoned) equivalent of masterTaskLibrary.js's getScopedGanttWorkPackages —
 * same output shape (`{ id, name, tasks: [{name, weight}], groups }`), grouped
 * by CATEGORY instead of phase (v2 has no phase concept; each category is the
 * v1-compatible "phase-shaped" grouping unit for display, matching how
 * buildV2ProgressTemplate.js treats each category as a synthetic v1 phase for
 * progress math). scope === null/undefined -> full list.
 *
 * @param {object|null} [scope] — project.scope (zones|workPackages|categories)
 * @returns {Array<{id:string, name:string, tasks:Array<{name:string,weight:number}>, groups:Array}>}
 */
export function getScopedGanttWorkPackagesV2(scope = null) {
  const scopedWPIds = getScopeWPIds(scope, ALL_WORK_PACKAGES_V2); // null = full scope
  const categoryIds = scope?.categories ?? null;                  // null = all categories
  const byCategory = new Map();

  for (const wp of ALL_WORK_PACKAGES_V2) {
    if (scopedWPIds && !scopedWPIds.includes(wp.id)) continue;
    if (categoryIds && !categoryIds.includes(wp.categoryId)) continue;
    if (!byCategory.has(wp.categoryId)) byCategory.set(wp.categoryId, []);
    byCategory.get(wp.categoryId).push(wp);
  }

  return Array.from(byCategory.entries()).map(([categoryId, wps]) => {
    const label = CATEGORY_LIBRARY[categoryId]?.label ?? categoryId;
    const taskNames = wps.map(wp => wp.label);
    return {
      id:     categoryId,
      name:   label,
      tasks:  wps.map(wp => ({ name: wp.label, weight: 1 })),
      groups: [{ id: `${categoryId}.g`, name: label, tasks: taskNames }],
    };
  });
}

/**
 * Groups a flat Gantt task list (as returned by ganttService.getProjectGantt —
 * task.id is the wp_id) into zone -> category -> tasks, via getWPGrouping —
 * never trusting project_gantt_tasks.phase_id/phase_label, which only carry
 * the zone id/label for v1 GanttChart back-compat (see ganttService.js's v2
 * seeding note). Shared by WorkPackageProgressSection.jsx (contractor form)
 * and SiteVisitFormView.jsx (PM form) so the zone/category grouping used to
 * render both forms' work-package lists has exactly one implementation.
 *
 * @param {Array<{id: string}>} ganttTasks
 * @param {string} templateType
 * @returns {Map<string, { zoneLabel: string, categories: Map<string, { categoryLabel: string, tasks: object[] }> }>}
 */
export function groupGanttTasksByZone(ganttTasks, templateType) {
  const zones = new Map();
  for (const task of ganttTasks) {
    const grouping = getWPGrouping(templateType, task.id);
    if (!grouping?.zoneId) continue;
    if (!zones.has(grouping.zoneId)) {
      zones.set(grouping.zoneId, { zoneLabel: grouping.zoneLabel, categories: new Map() });
    }
    const zone = zones.get(grouping.zoneId);
    if (!zone.categories.has(grouping.categoryId)) {
      zone.categories.set(grouping.categoryId, { categoryLabel: grouping.categoryLabel, tasks: [] });
    }
    zone.categories.get(grouping.categoryId).tasks.push(task);
  }
  return zones;
}
