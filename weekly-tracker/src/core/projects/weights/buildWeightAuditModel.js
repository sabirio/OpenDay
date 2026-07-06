import { computeEffectiveWeights } from './computeEffectiveWeights.js';
import { validateTemplate } from '../validation/validateTemplate.js';

/**
 * Builds the WeightAudit page's full display model: per-phase/per-WP
 * effective weights, the sums the "does this add up" validation banner
 * checks, and the list of WPs excluded from the current scope.
 *
 * Moved verbatim from WeightAudit.jsx's local buildAudit() (architecture-
 * conformance pass, 2026-07-06) — despite that function's own "zero new
 * math" comment, it computed real aggregate sums (effectiveSum, totalPW,
 * phaseWPSum) and derived ratios (progressWeightPct, durationPctInPhase)
 * inline in a page. Label maps are passed in rather than resolved here —
 * that's domain-config lookup, not calculation, and stays page-side.
 *
 * @param {{phases?: Array<{id:string, progressWeight?:number}>, workPackages?: Array<{id:string, phaseId:string, duration_pct?:number}>, name?:string, familyId?:string, version?:number}|null} template
 * @param {string[]|null} scopeWPIds
 * @param {Record<string,string>} phaseLabels — { phaseId → display label }
 * @param {Record<string,string>} wpLabels — { wpId → display label }
 * @returns {object|null}
 */
export function buildWeightAuditModel(template, scopeWPIds, phaseLabels, wpLabels) {
  if (!template) return null;

  const phases = template.phases ?? [];
  const wps    = template.workPackages ?? [];

  const phaseWeights    = Object.fromEntries(phases.map(p => [p.id, p.progressWeight ?? 0]));
  const effectiveWeights = computeEffectiveWeights(wps, scopeWPIds, phaseWeights);
  const effectiveSum     = Object.values(effectiveWeights).reduce((s, w) => s + w, 0);

  const totalPW    = phases.reduce((s, p) => s + (p.progressWeight ?? 0), 0);
  const inScopeSet = scopeWPIds ? new Set(scopeWPIds) : null;

  const phaseModels = phases.map(phase => {
    const phaseWPs   = wps.filter(wp => wp.phaseId === phase.id);
    const phaseWPSum = phaseWPs.reduce((s, wp) => s + (wp.duration_pct ?? 0), 0);
    const pw         = phase.progressWeight ?? 0;

    return {
      id:                 phase.id,
      label:              phaseLabels[phase.id] ?? phase.id,
      progressWeight:     pw,
      progressWeightPct:  totalPW > 0 ? (pw / totalPW) * 100 : 0,
      wps: phaseWPs.map(wp => ({
        id:               wp.id,
        label:            wpLabels[wp.id] ?? wp.id,
        duration_pct:     wp.duration_pct ?? 0,
        durationPctInPhase: phaseWPSum > 0 ? (wp.duration_pct ?? 0) / phaseWPSum : 0,
        effectiveWeight:  effectiveWeights[wp.id] ?? 0,
        inScope:          inScopeSet ? inScopeSet.has(wp.id) : true,
      })),
    };
  });

  const inEffective  = new Set(Object.keys(effectiveWeights));
  const excludedWPs  = wps
    .filter(wp => !inEffective.has(wp.id))
    .map(wp => ({ id: wp.id, label: wpLabels[wp.id] ?? wp.id }));

  return {
    templateMeta: {
      name:     template.name     ?? '(unnamed)',
      familyId: template.familyId ?? null,
      version:  template.version  ?? null,
    },
    validation: validateTemplate(template),
    effectiveSum,
    phases:     phaseModels,
    excludedWPs,
  };
}
