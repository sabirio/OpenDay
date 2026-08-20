import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
} from '../shared/UiPrimitives.jsx';
import { PageHeader as SharedPageHeader } from '../shared/LayoutPrimitives.jsx';
import { EmptyState as SharedEmptyState, ErrorState as SharedErrorState, LoadingState as SharedLoadingState } from '../shared/UiPatterns.jsx';

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
  return <nav className="flex gap-1 overflow-x-auto border-b border-ui-border" aria-label="Business Development sections">
    <Link className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold no-underline transition-colors ${section === 'home' ? 'border-ui-accent text-ui-accent' : 'border-transparent text-ui-muted hover:text-ui-primary'}`} to="/business-development">Overview</Link>
    {items.map(item => <Link key={item.to} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold no-underline transition-colors ${section === item.resource ? 'border-ui-accent text-ui-accent' : 'border-transparent text-ui-muted hover:text-ui-primary'}`} to={item.to}>{item.label}</Link>)}
  </nav>;
}

export function PageHeader({ title, description, organizationName, action }) {
  return <SharedPageHeader eyebrow="Business Development" icon={<Icon name="briefcase"/>} title={title} description={description} context={organizationName || 'Active organization'} action={action}/>;
}

export function PrimaryButton({ children, onClick, disabled, type = 'button' }) {
  return <Button type={type} onClick={onClick} disabled={disabled} variant="primary" size="lg">{children}</Button>;
}

export function SecondaryButton({ children, onClick, disabled, type = 'button', danger = false }) {
  return <Button type={type} onClick={onClick} disabled={disabled} variant={danger ? 'danger' : 'secondary'}>{children}</Button>;
}

export function StatusBadge({ value }) {
  const tone = ['WON', 'APPROVED', 'ACCEPTED', 'AWARDED', 'APPROVED_FOR_ISSUE'].includes(value)
    ? 'positive'
    : ['LOST', 'ARCHIVED'].includes(value)
      ? 'neutral'
      : ['REJECTED'].includes(value)
        ? 'danger'
        : ['INTERNAL_REVIEW', 'SENT', 'PROPOSAL', 'REVISED'].includes(value)
          ? 'warning'
          : 'accent';
  return <Badge tone={tone}>{String(value || 'DRAFT').replaceAll('_', ' ')}</Badge>;
}

export function LoadingState() {
  return <SharedLoadingState label="Loading commercial workspace…"/>;
}

export function ErrorState({ message, onRetry }) {
  return <SharedErrorState message={message} onRetry={onRetry}/>;
}

export function EmptyState({ title, body, action }) {
  return <SharedEmptyState title={title} body={body} action={action} icon={<Icon name="briefcase" className="size-6"/>}/>;
}
