import {
  DURATION_MODE,
  DURATION_RESOLUTION_MODE,
  validateDurationModel,
  validateWorkPackageDurationMetadata,
} from './durationContract.js';
import { resolveProjectArea } from '../projects/areas/resolveProjectArea.js';
import { computeAreaScaledDuration } from '../../engines/masterCatalogDurationEngine.js';

export class DurationContractError extends Error {
  constructor(issues) {
    const first = issues[0];
    super(`INVALID SCHEMA-V2 DURATION CONTRACT (${issues.length} issue(s), first: ${first?.code} — ${first?.message})`);
    this.name = 'DurationContractError';
    this.issues = issues;
  }
}

function assertValid(issues) {
  const errors = issues.filter(candidate => candidate.severity === 'error');
  if (errors.length > 0) throw new DurationContractError(errors);
}

/**
 * Pure schema-v2 execution-duration resolver.
 *
 * The resolver deliberately reads only wp.duration, durationModel, and the
 * canonical project-area resolver. Progress Weight metadata, legacy duration
 * percentages, cost, contractor count, and procurement facts are outside its
 * input contract and cannot influence its result.
 */
export function resolveWorkPackageDuration({ wp, durationModel, project }) {
  assertValid([
    ...validateDurationModel(durationModel),
    ...validateWorkPackageDurationMetadata(wp),
  ]);

  const { mode } = wp.duration;

  if (mode === DURATION_MODE.FIXED) {
    return {
      wpId: wp.id,
      mode,
      durationDays: wp.duration.baseDurationDays,
      scheduleParticipation: true,
      resolutionMode: DURATION_RESOLUTION_MODE.FIXED,
      areaBasis: null,
      canonicalArea: null,
      referenceArea: null,
      areaRatio: null,
      bandMultiplier: null,
    };
  }

  if (mode === DURATION_MODE.MILESTONE) {
    return {
      wpId: wp.id,
      mode,
      durationDays: 0,
      scheduleParticipation: true,
      resolutionMode: DURATION_RESOLUTION_MODE.MILESTONE,
      areaBasis: null,
      canonicalArea: null,
      referenceArea: null,
      areaRatio: null,
      bandMultiplier: null,
    };
  }

  if (mode === DURATION_MODE.EXCLUDED) {
    return {
      wpId: wp.id,
      mode,
      durationDays: null,
      scheduleParticipation: false,
      resolutionMode: DURATION_RESOLUTION_MODE.EXCLUDED,
      areaBasis: null,
      canonicalArea: null,
      referenceArea: null,
      areaRatio: null,
      bandMultiplier: null,
    };
  }

  const { baseDurationDays, areaBasis } = wp.duration;
  const canonicalArea = resolveProjectArea(project, areaBasis);
  const referenceArea = durationModel.referenceAreas[areaBasis];

  if (canonicalArea === null) {
    return {
      wpId: wp.id,
      mode,
      durationDays: baseDurationDays,
      scheduleParticipation: true,
      resolutionMode: DURATION_RESOLUTION_MODE.AREA_FALLBACK,
      areaBasis,
      canonicalArea: null,
      referenceArea,
      areaRatio: null,
      bandMultiplier: 1,
    };
  }

  const {
    durationDays,
    areaRatio,
    bandMultiplier,
  } = computeAreaScaledDuration({
    baseDurationDays,
    canonicalArea,
    referenceArea,
    bands: durationModel.bands,
  });
  return {
    wpId: wp.id,
    mode,
    durationDays,
    scheduleParticipation: true,
    resolutionMode: DURATION_RESOLUTION_MODE.AREA_BAND,
    areaBasis,
    canonicalArea,
    referenceArea,
    areaRatio,
    bandMultiplier,
  };
}

/**
 * Resolve duration facts for one explicit schema-v2 scope. Results retain
 * selected milestones and selected exclusions; scheduleTasks contains only
 * graph participants, while excluded makes intentional non-participation
 * directly observable.
 */
export function resolveSelectedScopeDurations({
  workPackages,
  selectedWpIds,
  durationModel,
  project,
}) {
  if (!Array.isArray(workPackages) || !Array.isArray(selectedWpIds)) {
    throw new TypeError('workPackages and selectedWpIds must be arrays.');
  }

  const byId = new Map(workPackages.map(wp => [wp.id, wp]));
  const seen = new Set();
  const results = [];
  for (const wpId of selectedWpIds) {
    if (seen.has(wpId)) {
      throw new Error(`Duplicate selected work package id "${wpId}".`);
    }
    seen.add(wpId);
    const wp = byId.get(wpId);
    if (!wp) throw new Error(`Selected work package "${wpId}" is absent from the resolved template.`);
    results.push(resolveWorkPackageDuration({ wp, durationModel, project }));
  }

  return {
    results,
    scheduleTasks: results.filter(result => result.scheduleParticipation),
    excluded: results.filter(result => !result.scheduleParticipation),
  };
}
