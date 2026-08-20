import { Button, Surface } from './UiPrimitives.jsx';
import { cx } from './uiClassNames.js';

export function DataTable({ children, minWidth = '900px', className }) {
  return <div className="max-w-full overflow-x-auto"><table className={cx('w-full border-collapse text-left text-sm', className)} style={{ minWidth }}>{children}</table></div>;
}

export function TableHead({ children }) {
  return <thead className="bg-ui-elevated text-[10px] font-extrabold uppercase tracking-wider text-ui-muted">{children}</thead>;
}

export function EmptyState({ title, body, action, icon }) {
  return <div className="grid min-h-64 place-items-center p-8 text-center"><div className="max-w-md">{icon ? <div className="mx-auto mb-4 grid size-12 place-items-center rounded-ui bg-ui-accent-subtle text-ui-accent">{icon}</div> : null}<h3 className="text-base font-bold text-ui-primary">{title}</h3><p className="mt-2 text-sm leading-6 text-ui-muted">{body}</p>{action ? <div className="mt-5">{action}</div> : null}</div></div>;
}

export function LoadingState({ label = 'Loading workspace…' }) {
  return <Surface className="grid min-h-64 place-items-center"><div className="flex items-center gap-3 text-sm text-ui-muted"><span className="size-5 animate-spin rounded-full border-2 border-ui-border border-t-ui-accent"/>{label}</div></Surface>;
}

export function ErrorState({ message, onRetry }) {
  return <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-ui border border-ui-danger bg-ui-danger-subtle p-8 text-center"><strong className="text-ui-danger">Workspace unavailable</strong><p className="max-w-lg text-sm text-ui-secondary">{message}</p>{onRetry ? <Button onClick={onRetry}>Try again</Button> : null}</div>;
}

export function InlineAlert({ children, tone = 'danger', className }) {
  const tones = {
    danger: 'border-ui-danger bg-ui-danger-subtle text-ui-danger',
    warning: 'border-ui-warning bg-ui-warning-subtle text-ui-warning',
    positive: 'border-ui-success bg-ui-success-subtle text-ui-success',
    neutral: 'border-ui-border bg-ui-elevated text-ui-secondary',
  };
  return <div role="alert" className={cx('rounded-ui-sm border px-4 py-3 text-sm', tones[tone], className)}>{children}</div>;
}

export function MetricCard({ label, value, detail, tone = 'neutral' }) {
  const tones = { neutral: 'text-ui-primary', accent: 'text-ui-accent', warning: 'text-ui-warning', danger: 'text-ui-danger' };
  return <Surface as="article" className="p-4" elevated><span className="text-[10px] font-extrabold uppercase tracking-wider text-ui-muted">{label}</span><strong className={cx('mt-2 block text-2xl font-extrabold', tones[tone])}>{value}</strong>{detail ? <small className="mt-1 block text-xs text-ui-muted">{detail}</small> : null}</Surface>;
}
