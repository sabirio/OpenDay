import { Link } from 'react-router-dom';

const ICONS = {
  plus: <path d="M12 5v14M5 12h14"/>,
  refresh: <path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.6-2.6L20 11M4 13l2.3 4.5A7 7 0 0 0 18 15"/>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></>,
};

export function Icon({ name, className = 'size-4' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

export function WorkspaceNavigation({ items, section }) {
  return <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border)]" aria-label="Business Development sections">
    <Link className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold no-underline transition-colors ${section === 'home' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`} to="/business-development">Overview</Link>
    {items.map(item => <Link key={item.to} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold no-underline transition-colors ${section === item.resource ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`} to={item.to}>{item.label}</Link>)}
  </nav>;
}

export function PageHeader({ title, description, organizationName, action }) {
  return <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
    <div className="max-w-3xl">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]"><Icon name="briefcase"/>Business Development</div>
      <h1 className="m-0 text-2xl font-bold tracking-[-0.025em] text-[var(--text-primary)] md:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">{organizationName || 'Active organization'}</span>
      {action}
    </div>
  </header>;
}

export function PrimaryButton({ children, onClick, disabled, type = 'button' }) {
  return <button type={type} onClick={onClick} disabled={disabled} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-[var(--accent)] px-4 text-sm font-bold text-[var(--text-inverse)] shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-page)] disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

export function SecondaryButton({ children, onClick, disabled, type = 'button', danger = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${danger ? 'border-[var(--status-alert)] bg-transparent text-[var(--status-alert)] hover:bg-[var(--status-alert-bg)]' : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'}`}>{children}</button>;
}

export function StatusBadge({ value }) {
  const tone = ['WON', 'APPROVED'].includes(value)
    ? 'border-[var(--status-done)] bg-[var(--status-done-bg)] text-[var(--status-done)]'
    : ['LOST', 'ARCHIVED'].includes(value)
      ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
      : ['INTERNAL_REVIEW', 'SENT', 'PROPOSAL'].includes(value)
        ? 'border-[var(--status-warn)] bg-[var(--status-warn-bg)] text-[var(--status-warn)]'
        : 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${tone}`}>{String(value || 'DRAFT').replaceAll('_', ' ')}</span>;
}

export function LoadingState() {
  return <div className="grid min-h-64 place-items-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]"><div className="flex items-center gap-3 text-sm text-[var(--text-muted)]"><span className="size-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"/>Loading commercial workspace…</div></div>;
}

export function ErrorState({ message, onRetry }) {
  return <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-[var(--status-alert)] bg-[var(--status-alert-bg)] p-8 text-center"><strong className="text-[var(--status-alert)]">Workspace unavailable</strong><p className="max-w-lg text-sm text-[var(--text-secondary)]">{message}</p><SecondaryButton onClick={onRetry}><Icon name="refresh"/>Try again</SecondaryButton></div>;
}

export function EmptyState({ title, body, action }) {
  return <div className="grid min-h-64 place-items-center p-8 text-center"><div className="max-w-md"><div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)]"><Icon name="briefcase" className="size-6"/></div><h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p><div className="mt-5">{action}</div></div></div>;
}
