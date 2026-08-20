import { cx } from './uiClassNames.js';

export const FIELD_TEXTAREA_CLASS = 'w-full resize-y rounded-ui border border-field-border bg-field-surface p-2.5 text-sm text-field-body outline-none focus:border-field-accent focus:ring-2 focus:ring-field-accent/20 disabled:cursor-not-allowed disabled:opacity-50';

export function FieldState({ title, body, icon = '—', mode = 'contractor' }) {
  const palette = mode === 'sitevisit' ? 'bg-field-sitevisit-page' : 'bg-field-contractor-page';
  return <div className={cx('grid min-h-screen place-items-center p-6', palette)}><div className="max-w-md p-10 text-center"><div className="mb-4 text-5xl" aria-hidden="true">{icon}</div><h2 className="mb-2 text-xl font-bold text-field-primary">{title}</h2><p className="text-sm leading-6 text-field-secondary">{body}</p></div></div>;
}

export function FieldPage({ children, mode = 'contractor' }) {
  const palette = mode === 'sitevisit' ? 'bg-field-sitevisit-page' : 'bg-field-contractor-page';
  return <div className={cx('field-form-page min-h-screen px-5 pb-28 pt-7', palette)}>{children}</div>;
}

export function FieldContainer({ children }) {
  return <div className="mx-auto w-full max-w-field">{children}</div>;
}

export function FieldPageHeader({ navigation, eyebrow, title, metadata = [], status }) {
  return <header className="mb-5">
    {navigation ? <nav className="mb-2.5 flex gap-4 text-sm">{navigation}</nav> : null}
    {eyebrow ? <div className="text-sm font-semibold tracking-wide text-field-muted">{eyebrow}</div> : null}
    <h1 className="mb-3.5 mt-0.5 text-2xl font-bold text-field-primary">{title}</h1>
    {metadata.length ? <div className="flex flex-wrap gap-5 text-sm text-field-secondary">{metadata.map(item => <span key={item.label}>{item.label}: <strong className="text-field-body">{item.value}</strong></span>)}</div> : null}
    {status ? <div className="mt-2.5">{status}</div> : null}
  </header>;
}

export function FieldPanel({ children, className, ...props }) {
  return <section className={cx('rounded-ui border border-field-border bg-field-surface', className)} {...props}>{children}</section>;
}

export function FieldButton({ children, variant = 'secondary', className, type = 'button', ...props }) {
  const variants = {
    primary: 'border-transparent bg-field-accent text-field-inverse',
    secondary: 'border-field-border-strong bg-field-surface text-field-secondary',
    ghost: 'border-transparent bg-transparent text-field-secondary hover:text-field-primary',
    danger: 'border-field-danger bg-field-danger-subtle text-field-danger',
  };
  return <button type={type} className={cx('inline-flex min-h-10 items-center justify-center rounded-ui border px-4 text-sm font-semibold transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-field-accent disabled:cursor-not-allowed disabled:border-transparent disabled:bg-field-neutral disabled:text-field-muted', variants[variant], className)} {...props}>{children}</button>;
}

export function FieldStatus({ children, tone = 'neutral', className }) {
  const tones = { neutral: 'text-field-secondary', positive: 'text-field-success', warning: 'text-field-warning', danger: 'text-field-danger' };
  return <span role="status" className={cx('text-[13px] font-semibold', tones[tone], className)}>{children}</span>;
}

export function FieldLoading({ children = 'Loading…', danger = false, className }) {
  return <div role={danger ? 'alert' : 'status'} className={cx('p-10 text-center text-sm', danger ? 'text-field-danger' : 'text-field-secondary', className)}>{children}</div>;
}

export function FieldStickyActions({ children }) {
  return <div className="fixed inset-x-0 bottom-0 z-[100] flex flex-wrap items-center justify-between gap-2.5 border-t border-field-border-strong bg-field-surface px-5 py-3 shadow-field">{children}</div>;
}

export function FieldAlert({ title, children, action }) {
  return <div className="mb-4 rounded-ui border border-field-danger bg-field-danger-subtle px-4 py-3.5"><div className="mb-1 font-bold text-field-danger">{title}</div>{children ? <div className="mb-2.5 text-sm text-field-body">{children}</div> : null}{action}</div>;
}

export function FieldModalContent({ title, titleId, description, children, footer }) {
  return <div className="min-w-80 max-w-md p-6"><h3 id={titleId} className="text-lg font-bold text-field-primary">{title}</h3>{description ? <p className="mt-2 text-sm leading-5 text-field-secondary">{description}</p> : null}<div className="mt-3">{children}</div>{footer ? <div className="mt-4 flex justify-end gap-2.5">{footer}</div> : null}</div>;
}
