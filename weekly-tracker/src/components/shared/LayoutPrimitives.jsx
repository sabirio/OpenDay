import { Badge } from './UiPrimitives.jsx';
import { cx } from './uiClassNames.js';

const PAGE_WIDTHS = Object.freeze({
  wide: 'max-w-screen-2xl',
  content: 'max-w-6xl',
  narrow: 'max-w-3xl',
});

const PAGE_INSETS = Object.freeze({
  none: '',
  page: 'px-6 pt-6',
});

export function PageShell({ children, width = 'wide', inset = 'none' }) {
  return <div className={cx('mx-auto grid w-full gap-5 pb-10', PAGE_WIDTHS[width] || PAGE_WIDTHS.wide, PAGE_INSETS[inset] ?? PAGE_INSETS.none)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, context, action, icon }) {
  return <header className="flex flex-col gap-5 border-b border-ui-border pb-6 lg:flex-row lg:items-end lg:justify-between">
    <div className="max-w-3xl">
      {eyebrow ? <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ui-accent">{icon}{eyebrow}</div> : null}
      <h1 className="m-0 text-2xl font-bold tracking-tight text-ui-primary md:text-3xl">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ui-muted">{description}</p> : null}
    </div>
    {context || action ? <div className="flex flex-wrap items-center gap-3">{context ? <Badge>{context}</Badge> : null}{action}</div> : null}
  </header>;
}

export function SectionHeader({ title, description, action, className }) {
  return <header className={cx('flex flex-col gap-3 border-b border-ui-border bg-ui-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div className="min-w-0"><h2 className="text-sm font-bold text-ui-primary">{title}</h2>{description ? <p className="mt-1 text-xs text-ui-muted">{description}</p> : null}</div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </header>;
}
