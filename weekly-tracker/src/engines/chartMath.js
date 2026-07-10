/**
 * chartMath.js — generic, domain-agnostic pure math for rendering small
 * gauges/sparklines (SVG arcs, value ranges, pixel/percent conversions).
 * No business rules live here — just the reusable geometry several
 * risk-dashboard charts (RiskGauge, ScoreBar, SPISparkline, EvmWidget)
 * were each reimplementing independently.
 */

/**
 * SVG circular-gauge arc: circumference of the ring plus the dash-length
 * that represents `score` out of `maxScore`.
 */
export function computeGaugeArc(score, maxScore, radius) {
  const circumference = 2 * Math.PI * radius;
  const dash = (score / maxScore) * circumference;
  return { circumference, dash };
}

/**
 * Value range for a sparkline's y-axis, with floors so a flat/low series
 * doesn't render as a full-height line (e.g. SPI series never shrink below
 * 0.5 on screen even if every point is 1.0).
 */
export function computeSparkRange(values, minFloor, maxFloor) {
  const min = Math.min(minFloor, ...values);
  const max = Math.max(maxFloor, ...values);
  return { min, max, range: (max - min) || 1 };
}

/** Maps a value within [min, min+range] to an inverted (SVG-space) y-pixel. */
export function valueToSparkY(value, min, range, height) {
  return height - ((value - min) / range) * height;
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Fraction (0-1) scaled to a pixel width. */
export function fractionToWidth(fraction, widthPx) {
  return Math.round(fraction * widthPx);
}

/** Fraction (0-1) as a percent (0-100), unrounded — for CSS width strings. */
export function fractionToPercent(fraction) {
  return fraction * 100;
}

/** value/max as a rounded percent (0-100). */
export function ratioToPercent(value, max) {
  return Math.round((value / max) * 100);
}

/** Percent (0-100) scaled to a pixel width — unrounded, unclamped, for
 * smooth SVG bar fills (contrast with fractionToWidth, which rounds). */
export function percentToWidth(pct, widthPx) {
  return (pct / 100) * widthPx;
}

/** Smallest value in a list. */
export function minOf(values) {
  return Math.min(...values);
}

/** Largest value in a list. */
export function maxOf(values) {
  return Math.max(...values);
}
