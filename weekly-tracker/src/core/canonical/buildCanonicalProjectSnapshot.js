import { WORK_PACKAGES as V1_WORK_PACKAGES } from '../../config/masterTaskLibrary.js';
import { V2_TEMPLATE_TYPE } from '../../domains/construction/templates/retailFitoutV2.js';
import { resolveProjectScopeTemplate } from '../../domains/construction/templates/versionedScopeTemplate.js';
import { resolveProjectScopeSelection } from '../projects/scope/getScopeWPIds.js';
import { CANONICAL_SOURCE_VERSION } from './types.js';
import { normalizeFiniteNumber } from '../../engines/canonicalCoreEngine.js';
import { resolveEffectiveV2ZoneAreas } from '../projects/areas/resolveProjectArea.js';

const PROGRESS_KEYS = new Set(['progress', 'progress_pct', 'actual_progress', 'observed_progress', 'gc_progress', 'overall_progress', 'overallProgress']);

function warning(code, path, originalValue, normalizedValue, message) {
  return { code, path, originalValue, normalizedValue, severity: 'warning', message };
}

function finiteNumber(value, path, warnings, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  const result = normalizeFiniteNumber(value, { min, max, fallback });
  if (result.invalid) {
    warnings.push(warning('INVALID_NUMBER_DROPPED', path, value, fallback));
    return fallback;
  }
  if (result.changed) warnings.push(warning('NUMBER_CLAMPED', path, value, result.value));
  return result.value;
}

function dateTime(value, path, warnings) {
  if (value === null || value === undefined || value === '') return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) {
    warnings.push(warning('INVALID_DATE_DROPPED', path, value, null));
    return null;
  }
  return new Date(ms).toISOString();
}

function recordDate(record, keys, path, warnings) {
  for (const key of keys) {
    if (record?.[key]) return dateTime(record[key], `${path}.${key}`, warnings);
  }
  return null;
}

function normalizeRecord(input, path, warnings) {
  if (!input || typeof input !== 'object') return {};
  const output = Array.isArray(input) ? [] : {};
  for (const [key, value] of Object.entries(input)) {
    const nextPath = `${path}.${key}`;
    if (PROGRESS_KEYS.has(key)) output[key] = finiteNumber(value, nextPath, warnings, { min: 0, max: 100, fallback: null });
    else if (Array.isArray(value)) output[key] = value.map((item, i) =>
      item && typeof item === 'object' ? normalizeRecord(item, `${nextPath}[${i}]`, warnings) : item
    );
    else if (value && typeof value === 'object') output[key] = normalizeRecord(value, nextPath, warnings);
    else output[key] = value;
  }
  return output;
}

function normalizeAndSort(records, path, dateKeys, warnings) {
  const seen = new Set();
  const normalized = [];
  for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
    const next = normalizeRecord(record, `${path}[${index}]`, warnings);
    const identity = next.id == null ? null : String(next.id);
    if (identity && seen.has(identity)) {
      warnings.push(warning('DUPLICATE_RECORD_DROPPED', `${path}[${index}].id`, next.id, null));
      continue;
    }
    if (identity) seen.add(identity);
    next._canonicalDate = recordDate(next, dateKeys, `${path}[${index}]`, warnings);
    normalized.push(next);
  }
  normalized.sort((a, b) => (a._canonicalDate ? Date.parse(a._canonicalDate) : -Infinity) - (b._canonicalDate ? Date.parse(b._canonicalDate) : -Infinity));
  return normalized;
}

function normalizeWorkPackages(records, warnings) {
  const seen = new Set();
  const normalized = [];
  for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
    const next = normalizeRecord(record, `workPackages[${index}]`, warnings);
    const identity = next.id == null ? null : String(next.id);
    if (identity && seen.has(identity)) {
      warnings.push(warning('DUPLICATE_WORK_PACKAGE_DROPPED', `workPackages[${index}].id`, next.id, null));
      continue;
    }
    if (identity) {
      seen.add(identity);
      next.id = identity;
    }
    normalized.push(next);
  }
  return normalized;
}

/** Pure raw-data boundary. Input objects are never mutated. */
export function buildCanonicalProjectSnapshot(raw = {}, options = {}) {
  const warnings = [];
  const calculatedAt = options.calculatedAt || new Date().toISOString();
  const project = normalizeRecord(raw.project || {}, 'project', warnings);
  const isV2 = project.templateType === V2_TEMPLATE_TYPE;
  const resolvedTemplate = resolveProjectScopeTemplate(project, {
    templatesById: raw.templatesById ?? {},
  });
  const workPackages = normalizeWorkPackages(
    raw.workPackages || (isV2 ? resolvedTemplate.workPackages : V1_WORK_PACKAGES),
    warnings,
  );
  const contractorReports = normalizeAndSort(raw.contractorReports || raw.reports, 'contractorReports', ['reportingDate', 'report_date', 'submittedAt', 'submitted_at'], warnings);
  const siteVisits = normalizeAndSort(raw.siteVisits, 'siteVisits', ['visitDate', 'visit_date', 'submittedAt', 'submitted_at'], warnings);
  const progressHistory = normalizeAndSort(raw.progressHistory || project.progressHistory, 'progressHistory', ['recordedAt', 'recorded_at', 'reportingDate'], warnings);
  const zoneAreas = resolveEffectiveV2ZoneAreas(project, { fallbackLegacyZoneAreas: raw.zoneAreas });
  const zones = Object.entries(zoneAreas).map(([id, area]) => ({
    id: String(id),
    area: finiteNumber(area, `zones.${id}.area`, warnings, { min: 0, fallback: 0 }),
  }));
  const resolvedScopeWPIds = resolveProjectScopeSelection({
    scope: project.scope,
    workPackages,
    schemaVersion: resolvedTemplate?.data?.schemaVersion,
  });
  const scopeWPIds = (resolvedScopeWPIds || workPackages.map(wp => wp.id)).map(String);
  const activeSet = new Set(scopeWPIds);
  const canonicalWPs = workPackages.map(wp => ({ ...wp, active: activeSet.has(wp.id), notApplicable: !activeSet.has(wp.id) }));
  const latestContractorReport = contractorReports.at(-1) || null;
  const latestSiteVisit = siteVisits.at(-1) || null;

  return {
    project,
    template: isV2
      ? normalizeRecord(resolvedTemplate.data, 'template', warnings)
      : (raw.template ? normalizeRecord(raw.template, 'template', warnings) : null),
    zones,
    workPackages: canonicalWPs,
    contractorReports,
    latestContractorReport,
    siteVisits,
    latestSiteVisit,
    progressHistory,
    risks: Array.isArray(raw.risks) ? structuredClone(raw.risks) : [],
    evidence: Array.isArray(raw.evidence) ? structuredClone(raw.evidence) : [],
    scope: { workPackageIds: [...activeSet], isPartial: activeSet.size !== canonicalWPs.length },
    metadata: {
      projectId: String(project.id ?? ''),
      organizationId: project.companyId == null ? null : String(project.companyId),
      calculatedAt,
      sourceVersion: CANONICAL_SOURCE_VERSION,
    },
    warnings,
  };
}
