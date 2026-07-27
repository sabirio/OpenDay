const TONES = new Set(['positive', 'caution', 'danger', 'info', 'neutral', 'muted']);

// Generic tone-based status pill. Knows nothing about Risk/Schedule/Snag/
// Report domain semantics — callers resolve a domain value (risk level,
// SPI status, report-age, ...) to one of the tones below via a presentation
// mapper (e.g. config/statusColors.js), then pass the result here. Do not
// add domain conditionals (`if (tone === 'CRITICAL')`) to this component —
// that logic belongs in the mapper, not the primitive.
export default function StatusBadge({ tone = 'neutral', children, className, ...rest }) {
  const safeTone = TONES.has(tone) ? tone : 'neutral';
  const classes = ['status-badge', `status-badge--${safeTone}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
