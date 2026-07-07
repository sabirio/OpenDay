import { getWPById, getPhaseById } from '../../../config/masterTaskLibrary.js';
import { getWPByIdV2, retailFitoutV2, CATEGORY_LIBRARY, V2_TEMPLATE_TYPE } from '../../../domains/construction/templates/retailFitoutV2.js';

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
