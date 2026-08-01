import { PROJECT_AREA_BASIS } from '../projects/areas/resolveProjectArea.js';
import { hasSimpleDecimalPrecision } from '../../engines/masterCatalogDurationEngine.js';

export const DURATION_MODEL_UNIT = 'PROJECT_WORKING_DAY';
export const DURATION_CALENDAR_PROFILE = 'RETAIL_7_DAY';

export const DURATION_MODE = Object.freeze({
  FIXED: 'FIXED',
  AREA_SCALED: 'AREA_SCALED',
  MILESTONE: 'MILESTONE',
  EXCLUDED: 'EXCLUDED',
});

export const DURATION_RESOLUTION_MODE = Object.freeze({
  FIXED: 'FIXED',
  AREA_BAND: 'AREA_BAND',
  AREA_FALLBACK: 'AREA_FALLBACK',
  MILESTONE: 'MILESTONE',
  EXCLUDED: 'EXCLUDED',
});

const DURATION_MODES = new Set(Object.values(DURATION_MODE));
const SCALED_AREA_BASES = new Set([
  PROJECT_AREA_BASIS.TOTAL_AREA,
  PROJECT_AREA_BASIS.SALES_AREA,
  PROJECT_AREA_BASIS.BOH_AREA,
]);
const MODEL_FIELDS = new Set(['version', 'unit', 'calendarProfile', 'referenceAreas', 'bands']);
const BAND_FIELDS = new Set(['maxRatio', 'multiplier']);
const WP_DURATION_FIELDS = new Set(['mode', 'baseDurationDays', 'areaBasis']);

function issue(code, message) {
  return { severity: 'error', code, message };
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateKnownFields(object, allowedFields, location) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return [];
  return Object.keys(object)
    .filter(field => !allowedFields.has(field))
    .map(field => issue(
      'UNSUPPORTED_DURATION_FIELD',
      `${location} contains unsupported duration field "${field}".`,
    ));
}

/**
 * Validate the template-level schema-v2 duration model. Bands are ordered
 * upper bounds: every bounded band has a positive finite maxRatio, bounds
 * strictly increase, and the final band has maxRatio:null (positive infinity).
 * That representation is gap/overlap-free by construction.
 */
export function validateDurationModel(durationModel) {
  if (!durationModel || typeof durationModel !== 'object' || Array.isArray(durationModel)) {
    return [issue('MISSING_DURATION_MODEL', 'Schema-v2 schedule metadata requires a durationModel object.')];
  }

  const issues = validateKnownFields(durationModel, MODEL_FIELDS, 'durationModel');

  if (!isPositiveInteger(durationModel.version)) {
    issues.push(issue('INVALID_DURATION_MODEL_VERSION', 'durationModel.version must be a positive integer.'));
  }
  if (durationModel.unit !== DURATION_MODEL_UNIT) {
    issues.push(issue('INVALID_DURATION_UNIT', `durationModel.unit must be "${DURATION_MODEL_UNIT}".`));
  }
  if (durationModel.calendarProfile !== DURATION_CALENDAR_PROFILE) {
    issues.push(issue(
      'INVALID_DURATION_CALENDAR',
      `durationModel.calendarProfile must be "${DURATION_CALENDAR_PROFILE}" for the initial implementation.`,
    ));
  }

  const referenceAreas = durationModel.referenceAreas;
  if (!referenceAreas || typeof referenceAreas !== 'object' || Array.isArray(referenceAreas)) {
    issues.push(issue('INVALID_REFERENCE_AREAS', 'durationModel.referenceAreas must be an object.'));
  } else {
    for (const key of Object.keys(referenceAreas)) {
      if (!SCALED_AREA_BASES.has(key)) {
        issues.push(issue('UNSUPPORTED_REFERENCE_AREA', `durationModel.referenceAreas contains unsupported basis "${key}".`));
      }
    }
    for (const basis of SCALED_AREA_BASES) {
      if (!isPositiveFinite(referenceAreas[basis])) {
        issues.push(issue('INVALID_REFERENCE_AREA', `durationModel.referenceAreas.${basis} must be positive and finite.`));
      }
    }
  }

  const bands = durationModel.bands;
  if (!Array.isArray(bands) || bands.length === 0) {
    issues.push(issue('INVALID_DURATION_BANDS', 'durationModel.bands must be a non-empty ordered array.'));
    return issues;
  }

  let previousMax = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const location = `durationModel.bands[${index}]`;
    if (!band || typeof band !== 'object' || Array.isArray(band)) {
      issues.push(issue('INVALID_DURATION_BAND', `${location} must be an object.`));
      continue;
    }
    issues.push(...validateKnownFields(band, BAND_FIELDS, location));

    if (!isPositiveFinite(band.multiplier) || !hasSimpleDecimalPrecision(band.multiplier)) {
      issues.push(issue(
        'INVALID_BAND_MULTIPLIER',
        `${location}.multiplier must be positive, finite, and use at most two decimal places.`,
      ));
    }

    const isLast = index === bands.length - 1;
    if (isLast) {
      if (band.maxRatio !== null) {
        issues.push(issue(
          'INCOMPLETE_DURATION_BANDS',
          'The final duration band must use maxRatio:null to cover all remaining positive ratios.',
        ));
      }
      continue;
    }

    if (!isPositiveFinite(band.maxRatio) || !hasSimpleDecimalPrecision(band.maxRatio)) {
      issues.push(issue(
        'INVALID_BAND_BOUND',
        `${location}.maxRatio must be positive, finite, and use at most two decimal places.`,
      ));
    } else if (band.maxRatio <= previousMax) {
      issues.push(issue(
        'OVERLAPPING_DURATION_BANDS',
        `${location}.maxRatio must be strictly greater than the previous band bound.`,
      ));
    } else {
      previousMax = band.maxRatio;
    }
  }

  return issues;
}

export function validateWorkPackageDurationMetadata(wp) {
  const id = wp?.id ?? '(unknown)';
  const duration = wp?.duration;
  if (!duration || typeof duration !== 'object' || Array.isArray(duration)) {
    return [issue('MISSING_DURATION_METADATA', `Work package "${id}" requires explicit duration metadata.`)];
  }

  const issues = validateKnownFields(duration, WP_DURATION_FIELDS, `Work package "${id}" duration`);
  const mode = duration.mode;
  if (!DURATION_MODES.has(mode)) {
    issues.push(issue('INVALID_DURATION_MODE', `Work package "${id}" has unsupported or missing duration.mode.`));
    return issues;
  }

  if (mode === DURATION_MODE.FIXED || mode === DURATION_MODE.AREA_SCALED) {
    if (!isPositiveInteger(duration.baseDurationDays)) {
      issues.push(issue(
        'INVALID_BASE_DURATION',
        `Work package "${id}" ${mode} duration requires positive integer baseDurationDays.`,
      ));
    }
  } else if (duration.baseDurationDays !== undefined) {
    issues.push(issue(
      'UNEXPECTED_BASE_DURATION',
      `Work package "${id}" ${mode} duration must not define baseDurationDays.`,
    ));
  }

  if (mode === DURATION_MODE.AREA_SCALED) {
    if (!SCALED_AREA_BASES.has(duration.areaBasis)) {
      issues.push(issue(
        'INVALID_DURATION_AREA_BASIS',
        `Work package "${id}" AREA_SCALED duration requires TOTAL_AREA, SALES_AREA, or BOH_AREA.`,
      ));
    }
  } else if (duration.areaBasis !== undefined) {
    issues.push(issue(
      'UNEXPECTED_DURATION_AREA_BASIS',
      `Work package "${id}" ${mode} duration must not define areaBasis.`,
    ));
  }

  return issues;
}

/**
 * Operational validation is intentionally separate from the structural and
 * frozen Progress Weight validators. The real 221-WP candidate is allowed to
 * exist without duration metadata, but it is not schedulable until this
 * validator passes for its immutable template version.
 */
export function validateMasterCatalogDurationMetadata(data) {
  if (!data || data.schemaVersion !== 2 || !Array.isArray(data.zones)) {
    return [issue('INVALID_DURATION_TEMPLATE', 'Duration metadata requires a schemaVersion 2 zoned template.')];
  }

  const issues = validateDurationModel(data.durationModel);
  for (const zone of data.zones) {
    for (const category of zone.categories ?? []) {
      for (const wp of category.workPackages ?? []) {
        issues.push(...validateWorkPackageDurationMetadata(wp));
      }
    }
  }
  return issues;
}

export function isOperationalMasterCatalogDurationModel(data) {
  return validateMasterCatalogDurationMetadata(data).every(candidate => candidate.severity !== 'error');
}
