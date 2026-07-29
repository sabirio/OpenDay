/**
 * Pure schema-v2 duration arithmetic.
 *
 * This engine knows nothing about templates, scope, Progress Weight,
 * procurement, dependencies, CPM, persistence, or presentation.
 */

export function hasSimpleDecimalPrecision(value, decimalPlaces = 2) {
  const scale = 10 ** decimalPlaces;
  return Math.abs((value * scale) - Math.round(value * scale)) < 1e-9;
}

export function computeAreaScaledDuration({
  baseDurationDays,
  canonicalArea,
  referenceArea,
  bands,
}) {
  const areaRatio = canonicalArea / referenceArea;
  const band = bands.find(candidate =>
    candidate.maxRatio === null || areaRatio < candidate.maxRatio);
  return {
    durationDays: Math.max(1, Math.round(baseDurationDays * band.multiplier)),
    areaRatio,
    bandMultiplier: band.multiplier,
  };
}
