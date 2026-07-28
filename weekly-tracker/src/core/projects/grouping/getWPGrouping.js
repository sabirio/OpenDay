import { getWPById, getPhaseById } from '../../../config/masterTaskLibrary.js';
import { V2_TEMPLATE_TYPE } from '../../../domains/construction/templates/retailFitoutV2.js';
import {
  getScopeTemplateGrouping,
  getScopeTemplateWorkPackages,
  resolveV2TemplateData,
} from '../../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveProjectScopeSelection } from '../scope/getScopeWPIds.js';

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
export function getWPGrouping(templateType, wpId, projectOrTemplate = null) {
  if (templateType === V2_TEMPLATE_TYPE) {
    return getScopeTemplateGrouping(resolveV2TemplateData(projectOrTemplate), wpId);
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
export function getScopedGanttWorkPackagesV2(scope = null, projectOrTemplate = null) {
  const data = resolveV2TemplateData(projectOrTemplate);
  const workPackages = getScopeTemplateWorkPackages(data);
  const scopedWPIds = resolveProjectScopeSelection({ scope, workPackages, schemaVersion: data?.schemaVersion }); // null = full scope (schema v1); [] = explicitly empty (schema v2)
  const categoryIds = scope?.categories ?? null;                  // null = all categories
  const byCategory = new Map();

  for (const wp of workPackages) {
    if (scopedWPIds && !scopedWPIds.includes(wp.id)) continue;
    if (categoryIds && !categoryIds.includes(wp.categoryId)) continue;
    if (!byCategory.has(wp.categoryId)) byCategory.set(wp.categoryId, []);
    byCategory.get(wp.categoryId).push(wp);
  }

  return Array.from(byCategory.entries()).map(([categoryId, wps]) => {
    const label = data.zones
      .flatMap(zone => zone.categories ?? [])
      .find(category => category.id === categoryId)?.label ?? categoryId;
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
export function groupGanttTasksByZone(ganttTasks, templateType, projectOrTemplate = null) {
  const zones = new Map();
  for (const task of ganttTasks) {
    const grouping = getWPGrouping(templateType, task.id, projectOrTemplate);
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
