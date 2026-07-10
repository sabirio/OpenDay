import { clampProgressPct } from './progressEngine.js';

export function normalizeFiniteNumber(value, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === null || value === undefined || value === '') return { value: fallback, changed: false, invalid: false };
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return { value: fallback, changed: true, invalid: true };
  const normalized = numeric < min ? min : numeric > max ? max : numeric;
  return { value: normalized, changed: normalized !== numeric, invalid: false };
}

export function roundCanonical(value) {
  return Math.round(value * 100) / 100;
}

export function meanObservedProgress(rows) {
  if (!rows.length) return null;
  let total = 0;
  for (const row of rows) total += clampProgressPct(Number(row.observed_progress));
  return roundCanonical(total / rows.length);
}

export function computeCanonicalDifference(contractorProgress, pmVerifiedProgress) {
  if (contractorProgress == null || pmVerifiedProgress == null) {
    return { signedDifference: null, absoluteDifference: null };
  }
  const signedDifference = roundCanonical(contractorProgress - pmVerifiedProgress);
  return { signedDifference, absoluteDifference: Math.abs(signedDifference) };
}

export function convertPersistedDiscrepancySign(value, sourceConvention) {
  if (value == null) return { value: null, absoluteValue: null, known: true };
  const numeric = Number(value);
  if (sourceConvention === 'pm-minus-contractor') return { value: -numeric, absoluteValue: Math.abs(numeric), known: true };
  if (sourceConvention === 'contractor-minus-pm') return { value: numeric, absoluteValue: Math.abs(numeric), known: true };
  return { value: null, absoluteValue: null, known: false };
}
