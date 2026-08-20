import { useDeferredValue, useMemo, useState } from 'react';
import { EmptyState, Icon, PrimaryButton, SecondaryButton, StatusBadge } from './BusinessDevelopmentShell.jsx';
import { CONTROL_CLASS, Field, Surface } from '../shared/UiPrimitives.jsx';
import { InlineAlert } from '../shared/UiPatterns.jsx';

const OPPORTUNITY_STATUSES = ['DRAFT', 'QUALIFYING', 'ESTIMATING', 'PROPOSAL', 'SENT', 'WON', 'LOST'];
const CURRENCIES = ['KZT', 'USD', 'EUR'];
const INPUT_CLASS = CONTROL_CLASS;

function suggestedNumber(count) {
  const year = new Date().getFullYear();
  return `OPP-${year}-${String(count + 1).padStart(3, '0')}`;
}

export function FormField({ label, hint, children, required = false }) {
  return <Field label={label} hint={hint} required={required}>{children}</Field>;
}

function OpportunityEditor({ opportunity, opportunityCount, saving, onSave, onClose }) {
  const [draft, setDraft] = useState(() => opportunity ? { ...opportunity } : {
    opportunityId: null,
    opportunityNumber: suggestedNumber(opportunityCount),
    title: '',
    clientName: '',
    currencyCode: 'KZT',
    status: 'DRAFT',
    revision: 0,
  });
  const [validation, setValidation] = useState(null);

  function update(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.opportunityNumber.trim() || !draft.title.trim() || !draft.clientName.trim()) {
      setValidation('Opportunity number, title and client are required.');
      return;
    }
    setValidation(null);
    try {
      await onSave(draft);
    } catch {
      // The page-level command wrapper keeps the editor open and shows a toast.
    }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[1px]" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="opportunity-editor-title" className="flex h-full w-full max-w-xl flex-col border-l border-ui-border bg-ui-surface shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-ui-border p-5 md:p-6"><div><span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ui-accent">Pipeline record</span><h2 id="opportunity-editor-title" className="mt-1 text-xl font-bold text-ui-primary">{opportunity ? 'Edit opportunity' : 'New opportunity'}</h2><p className="mt-1 text-sm text-ui-muted">Capture only the information needed to qualify and estimate the work.</p></div><button type="button" onClick={onClose} aria-label="Close editor" className="grid size-10 shrink-0 place-items-center rounded-lg border border-ui-border text-xl text-ui-muted hover:bg-ui-elevated">×</button></header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5 md:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Opportunity number" hint="Short organization-wide reference." required><input className={INPUT_CLASS} value={draft.opportunityNumber} onChange={event => update('opportunityNumber', event.target.value.toUpperCase())} maxLength={40}/></FormField>
            <FormField label="Stage" required><select className={INPUT_CLASS} value={draft.status} onChange={event => update('status', event.target.value)}>{OPPORTUNITY_STATUSES.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></FormField>
          </div>
          <FormField label="Opportunity title" hint="A concise description of the potential engagement." required><input className={INPUT_CLASS} value={draft.title} onChange={event => update('title', event.target.value)} placeholder="Example: Flagship store delivery programme" maxLength={240}/></FormField>
          <FormField label="Client" required><input className={INPUT_CLASS} value={draft.clientName} onChange={event => update('clientName', event.target.value)} placeholder="Legal or trading name" maxLength={240}/></FormField>
          <FormField label="Working currency" hint="All linked delivery estimates must use this currency." required><select className={INPUT_CLASS} value={draft.currencyCode} onChange={event => update('currencyCode', event.target.value)}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></FormField>
          <InlineAlert tone="neutral"><strong className="text-ui-primary">What happens next?</strong><p className="mt-1 text-xs leading-5 text-ui-muted">Once qualified, create an internal delivery estimate. Cost rates remain organization-confidential and never appear in the future client proposal.</p></InlineAlert>
          {validation ? <InlineAlert>{validation}</InlineAlert> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-ui-border bg-ui-surface p-4 md:px-6"><SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save opportunity'}</PrimaryButton></footer>
      </form>
    </section>
  </div>;
}

export default function OpportunityWorkspace({ opportunities, estimates, saving, onSave, onCreateEstimate }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [editor, setEditor] = useState(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const estimateCountByOpportunity = useMemo(() => {
    const counts = new Map();
    for (const estimate of estimates) counts.set(estimate.opportunityId, (counts.get(estimate.opportunityId) || 0) + 1);
    return counts;
  }, [estimates]);
  const filtered = useMemo(() => opportunities.filter(item => {
    if (status !== 'ALL' && item.status !== status) return false;
    if (!deferredQuery) return true;
    return `${item.opportunityNumber} ${item.title} ${item.clientName}`.toLowerCase().includes(deferredQuery);
  }), [opportunities, status, deferredQuery]);

  async function save(draft) {
    await onSave(draft);
    setEditor(null);
  }

  return <Surface elevated>
    <div className="flex flex-col gap-3 border-b border-ui-border p-4 md:flex-row md:items-center md:justify-between">
      <div><h2 className="text-base font-bold text-ui-primary">Opportunity register</h2><p className="mt-1 text-xs text-ui-muted">{opportunities.length} total · {filtered.length} shown</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="Search opportunities" className={`${INPUT_CLASS} sm:w-64`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search number, title or client"/>
        <select aria-label="Filter by opportunity stage" className={`${INPUT_CLASS} sm:w-44`} value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All stages</option>{OPPORTUNITY_STATUSES.map(value => <option key={value}>{value}</option>)}</select>
        <PrimaryButton onClick={() => setEditor({ mode: 'new' })}><Icon name="plus"/>New opportunity</PrimaryButton>
      </div>
    </div>
    {opportunities.length === 0 ? <EmptyState title="No opportunities recorded" body="Create the first pipeline record for this organization. It will become the controlled source for internal delivery estimates." action={<PrimaryButton onClick={() => setEditor({ mode: 'new' })}><Icon name="plus"/>Create opportunity</PrimaryButton>}/> : <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead className="bg-ui-elevated text-[10px] font-extrabold uppercase tracking-[0.08em] text-ui-muted"><tr><th className="px-4 py-3">Opportunity</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3 text-center">Estimates</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody>{filtered.map(item => <tr key={item.opportunityId} className="border-t border-ui-border text-sm transition hover:bg-ui-elevated"><td className="px-4 py-3"><strong className="block text-ui-primary">{item.title}</strong><span className="mt-0.5 block text-xs font-semibold text-ui-accent">{item.opportunityNumber}</span></td><td className="px-4 py-3 text-ui-secondary">{item.clientName}</td><td className="px-4 py-3"><StatusBadge value={item.status}/></td><td className="px-4 py-3 text-center font-bold text-ui-primary">{estimateCountByOpportunity.get(item.opportunityId) || 0}</td><td className="px-4 py-3 font-mono text-xs font-bold text-ui-secondary">{item.currencyCode}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><SecondaryButton onClick={() => setEditor({ mode: 'edit', item })}>Edit</SecondaryButton><SecondaryButton onClick={() => onCreateEstimate(item)}>Create estimate</SecondaryButton></div></td></tr>)}</tbody>
      </table>
      {filtered.length === 0 ? <p className="p-8 text-center text-sm text-ui-muted">No opportunities match the current filters.</p> : null}
    </div>}
    {editor ? <OpportunityEditor key={editor.item?.opportunityId || 'new'} opportunity={editor.item} opportunityCount={opportunities.length} saving={saving} onSave={save} onClose={() => setEditor(null)}/> : null}
  </Surface>;
}

export { INPUT_CLASS };
