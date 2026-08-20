import { useDeferredValue, useMemo, useState } from 'react';
import { Button, CONTROL_CLASS, Field, Surface } from '../shared/UiPrimitives.jsx';
import { SectionHeader } from '../shared/LayoutPrimitives.jsx';
import { DataTable, EmptyState, TableHead } from '../shared/UiPatterns.jsx';
import { Icon, StatusBadge } from './BusinessDevelopmentShell.jsx';
import { formatMoney } from './formatters.js';

const CURRENCIES = ['KZT', 'USD', 'EUR'];
const today = () => new Date().toISOString().slice(0, 10);

function emptyRate() {
  return { rateCardId: null, roleName: '', discipline: '', internalCostRate: '', sellingRate: '', currencyCode: 'KZT', validFrom: today(), validTo: '', status: 'ACTIVE', revision: 0 };
}

function RateCardEditor({ entry, saving, onSave, onClose }) {
  const [draft, setDraft] = useState(() => entry ? { ...entry, internalCostRate: String(entry.internalCostRate), sellingRate: entry.sellingRate == null ? '' : String(entry.sellingRate) } : emptyRate());
  const [validation, setValidation] = useState('');
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!draft.roleName.trim() || draft.internalCostRate === '' || !draft.validFrom) return setValidation('Role, internal cost rate and valid-from date are required.');
    setValidation('');
    try { await onSave(draft); } catch { /* Page toast owns the message. */ }
  }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="flex h-full w-full max-w-xl flex-col border-l border-ui-border bg-ui-surface shadow-ui-raised" role="dialog" aria-modal="true" aria-labelledby="rate-card-editor-title" onSubmit={submit}>
      <SectionHeader className="p-5 md:p-6" title={entry ? 'Edit rate card entry' : 'New rate card entry'} description="Rates are organization-confidential and effective-dated." action={<Button variant="ghost" onClick={onClose} aria-label="Close rate card editor">×</Button>}/>
      <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5 md:p-6">
        <Field label="Role / grade" required><input className={CONTROL_CLASS} value={draft.roleName} onChange={event => update('roleName', event.target.value)} placeholder="Senior Architect"/></Field>
        <Field label="Discipline"><input className={CONTROL_CLASS} value={draft.discipline || ''} onChange={event => update('discipline', event.target.value)} placeholder="Architecture"/></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Internal cost rate" required><input inputMode="decimal" className={CONTROL_CLASS} value={draft.internalCostRate} onChange={event => update('internalCostRate', event.target.value)} placeholder="0.00"/></Field><Field label="Optional selling rate"><input inputMode="decimal" className={CONTROL_CLASS} value={draft.sellingRate || ''} onChange={event => update('sellingRate', event.target.value)} placeholder="0.00"/></Field></div>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Currency" required><select className={CONTROL_CLASS} value={draft.currencyCode} onChange={event => update('currencyCode', event.target.value)}>{CURRENCIES.map(value => <option key={value}>{value}</option>)}</select></Field><Field label="Status" required><select className={CONTROL_CLASS} value={draft.status} onChange={event => update('status', event.target.value)}><option>ACTIVE</option><option>INACTIVE</option></select></Field></div>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Valid from" required><input type="date" className={CONTROL_CLASS} value={draft.validFrom} onChange={event => update('validFrom', event.target.value)}/></Field><Field label="Valid to"><input type="date" className={CONTROL_CLASS} value={draft.validTo || ''} onChange={event => update('validTo', event.target.value)}/></Field></div>
        {validation ? <p role="alert" className="rounded-ui-sm border border-ui-danger bg-ui-danger-subtle px-3 py-2 text-sm text-ui-danger">{validation}</p> : null}
      </div>
      <footer className="flex justify-end gap-3 border-t border-ui-border p-4 md:px-6"><Button onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save rate'}</Button></footer>
    </form>
  </div>;
}

export default function RateCardWorkspace({ rateCards, saving, onSave }) {
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filtered = useMemo(() => rateCards.filter(item => !deferredQuery || `${item.roleName} ${item.discipline || ''} ${item.currencyCode}`.toLowerCase().includes(deferredQuery)), [rateCards, deferredQuery]);
  async function save(draft) { await onSave(draft); setEditor(null); }
  return <Surface elevated>
    <SectionHeader title="Organization rate cards" description={`${rateCards.length} effective-dated internal and optional selling rates`} action={<div className="flex gap-2"><input aria-label="Search rate cards" className={`${CONTROL_CLASS} w-56`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search role or discipline"/><Button variant="primary" onClick={() => setEditor({ mode: 'new' })}><Icon name="plus"/>New rate</Button></div>}/>
    {rateCards.length === 0 ? <EmptyState title="No organization rate cards" body="Create controlled cost rates by role or grade. Estimates may still use manual rates, while rate cards provide a reusable source." action={<Button variant="primary" onClick={() => setEditor({ mode: 'new' })}>Create first rate</Button>}/> : <DataTable minWidth="820px"><TableHead><tr><th className="px-4 py-3">Role / discipline</th><th className="px-4 py-3">Validity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Internal cost</th><th className="px-4 py-3 text-right">Selling rate</th><th className="px-4 py-3 text-right">Action</th></tr></TableHead><tbody>{filtered.map(item => <tr key={item.rateCardId} className="border-t border-ui-border hover:bg-ui-elevated"><td className="px-4 py-3"><strong className="block text-ui-primary">{item.roleName}</strong><small className="text-ui-muted">{item.discipline || 'All disciplines'} · R{item.revision}</small></td><td className="px-4 py-3 text-ui-secondary">{item.validFrom} → {item.validTo || 'Open'}</td><td className="px-4 py-3"><StatusBadge value={item.status}/></td><td className="px-4 py-3 text-right font-mono text-ui-primary">{formatMoney(item.internalCostRate, item.currencyCode)}</td><td className="px-4 py-3 text-right font-mono text-ui-secondary">{item.sellingRate == null ? '—' : formatMoney(item.sellingRate, item.currencyCode)}</td><td className="px-4 py-3 text-right"><Button size="sm" onClick={() => setEditor({ mode: 'edit', item })}>Edit</Button></td></tr>)}</tbody></DataTable>}
    {editor ? <RateCardEditor entry={editor.item} saving={saving} onSave={save} onClose={() => setEditor(null)}/> : null}
  </Surface>;
}
