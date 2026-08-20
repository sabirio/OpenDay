import { cx } from './uiClassNames.js';

export const CONTROL_CLASS = 'h-9 w-full rounded-ui-sm border border-ui-border bg-ui-input px-3 text-sm text-ui-primary outline-none transition placeholder:text-ui-muted focus:border-ui-accent focus:ring-2 focus:ring-ui-accent-subtle disabled:cursor-not-allowed disabled:opacity-50';
export const TEXTAREA_CLASS = 'min-h-24 w-full resize-y rounded-ui-sm border border-ui-border bg-ui-input px-3 py-2 text-sm text-ui-primary outline-none transition placeholder:text-ui-muted focus:border-ui-accent focus:ring-2 focus:ring-ui-accent-subtle disabled:cursor-not-allowed disabled:opacity-50';

export function Surface({ as: Element = 'section', children, className, elevated = false }) {
  return <Element className={cx('overflow-hidden rounded-ui border border-ui-border bg-ui-surface', elevated && 'shadow-ui', className)}>{children}</Element>;
}

export function Button({ children, variant = 'secondary', size = 'md', className, type = 'button', ...props }) {
  const variants = {
    primary: 'border-transparent bg-ui-accent text-ui-inverse hover:brightness-110',
    secondary: 'border-ui-border bg-ui-surface text-ui-secondary hover:bg-ui-elevated hover:text-ui-primary',
    danger: 'border-ui-danger bg-transparent text-ui-danger hover:bg-ui-danger-subtle',
    ghost: 'border-transparent bg-transparent text-ui-secondary hover:bg-ui-elevated hover:text-ui-primary',
  };
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm', lg: 'h-10 px-5 text-sm' };
  return <button type={type} className={cx('inline-flex items-center justify-center gap-2 rounded-ui-sm border font-semibold transition focus:outline-none focus:ring-2 focus:ring-ui-accent disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], className)} {...props}>{children}</button>;
}

export function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-ui-border bg-ui-elevated text-ui-secondary',
    accent: 'border-ui-accent bg-ui-accent-subtle text-ui-accent',
    positive: 'border-ui-success bg-ui-success-subtle text-ui-success',
    warning: 'border-ui-warning bg-ui-warning-subtle text-ui-warning',
    danger: 'border-ui-danger bg-ui-danger-subtle text-ui-danger',
  };
  return <span className={cx('inline-flex rounded-ui-pill border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider', tones[tone])}>{children}</span>;
}

export function Field({ label, hint, required = false, children, className }) {
  return <label className={cx('grid gap-1.5 text-xs font-bold text-ui-secondary', className)}><span>{label}{required ? <span className="ml-1 text-ui-danger">*</span> : null}</span>{children}{hint ? <small className="font-normal leading-5 text-ui-muted">{hint}</small> : null}</label>;
}

export function Eyebrow({ children, className }) {
  return <span className={cx('text-[10px] font-extrabold uppercase tracking-widest text-ui-accent', className)}>{children}</span>;
}

export function ProgressBar({ value, pct, tone = 'accent', color, width = 72, height = 4, className }) {
  const displayedValue = value ?? pct ?? 0;
  const tones = { accent: 'bg-ui-accent', muted: 'bg-ui-muted', positive: 'bg-ui-success', warning: 'bg-ui-warning', danger: 'bg-ui-danger' };
  return <span className={cx('block shrink-0 overflow-hidden rounded-full bg-ui-border', className)} style={{ width, height }} aria-hidden="true"><span className={cx('block h-full rounded-full', color ? null : tones[tone])} style={{ width: `${displayedValue}%`, backgroundColor: color }}/></span>;
}
