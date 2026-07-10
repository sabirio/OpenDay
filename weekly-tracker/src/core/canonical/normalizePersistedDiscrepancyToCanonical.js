import { convertPersistedDiscrepancySign } from '../../engines/canonicalCoreEngine.js';

/** Converts an explicitly-declared stored sign convention without mutating the row. */
export function normalizePersistedDiscrepancyToCanonical(row, sourceConvention) {
  const sourceValue = row?.signedDelta ?? row?.discrepancy_delta ?? row?.delta ?? null;
  const converted = convertPersistedDiscrepancySign(sourceValue, sourceConvention);
  return {
    sourceConvention,
    canonicalConvention: 'contractor-minus-pm',
    signedDifference: converted.value,
    absoluteDifference: converted.absoluteValue,
    warnings: converted.known ? [] : [{
      code: 'UNKNOWN_DISCREPANCY_SIGN_CONVENTION', path: 'sourceConvention',
      originalValue: sourceConvention, normalizedValue: null, severity: 'warning',
    }],
  };
}
