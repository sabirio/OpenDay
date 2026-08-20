import { useDeferredValue, useMemo, useState } from 'react';
import { useEstimateCalculation } from '../../hooks/useBusinessDevelopmentWorkspace.js';
import { EmptyState, Icon, PrimaryButton, SecondaryButton, StatusBadge } from './BusinessDevelopmentShell.jsx';
import { FormField, INPUT_CLASS } from './OpportunityWorkspace.jsx';
import { formatMoney } from './formatters.js';
import { Surface } from '../shared/UiPrimitives.jsx';
import { InlineAlert } from '../shared/UiPatterns.jsx';

const ESTIMATE_STATUSES = ['DRAFT', 'INTERNAL_REVIEW', 'APPROVED', 'ARCHIVED'];
const CATEGORY_META = Object.freeze({
  INTERNAL_LABOUR: { label: 'Internal labour', short: 'Labour', description: 'Organization-owned delivery effort by discipline and grade.' },
  EXTERNAL_COST: { label: 'External cost', short: 'External', description: 'Supplier, subcontractor and specialist delivery cost.' },
  OTHER_DIRECT_COST: { label: 'Other direct cost', short: 'Other', description: 'Travel, permits, logistics and other attributable cost.' },
});

function suggestedEstimateNumber(count) {
  const year = new Date().getFullYear();
  return `EST-${year}-${String(count + 1).padStart(3, '0')}`;
}

function normalizeEstimate(estimate) {
  return {
    estimateId: estimate.estimateId,
    opportunityId: estimate.opportunityId,
    estimateNumber: estimate.estimateNumber,
    title: estimate.title,
    currencyCode: estimate.currencyCode,
    status: estimate.status,
    expectedRevision: estimate.revision,
    items: (estimate.items || []).map(item => ({
      id: item.itemId,
      category: item.category,
      description: item.description || '',
      discipline: item.discipline || '',
      employeeGrade: item.employeeGrade || '',
      supplierName: item.supplierName || '',
      quantity: String(item.quantity ?? ''),
      unit: item.unit || '',
      unitCostRate: String(item.unitCostRate ?? ''),
      note: item.note || '',
    })),
  };
}

function newEstimate(opportunities, estimateCount, opportunityId, createItem) {
  const opportunity = opportunities.find(item => item.opportunityId === opportunityId) || opportunities[0];
  return {
    estimateId: null,
    opportunityId: opportunity?.opportunityId || '',
    estimateNumber: suggestedEstimateNumber(estimateCount),
    title: opportunity ? `${opportunity.title} — delivery estimate` : '',
    currencyCode: opportunity?.currencyCode || 'KZT',
    status: 'DRAFT',
    expectedRevision: 0,
    items: [createItem('INTERNAL_LABOUR')],
  };
}

function EstimateLine({ item, amount, onChange, onRemove, rateCards }) {
  const meta = CATEGORY_META[item.category];
  return <div className="grid min-w-[1060px] grid-cols-[minmax(220px,2fr)_150px_135px_90px_95px_130px_130px_44px] items-start gap-2 border-t border-ui-border px-4 py-3 first:border-t-0">
    <div><input aria-label={`${meta.label} description`} className={INPUT_CLASS} value={item.description} onChange={event => onChange('description', event.target.value)} placeholder="Cost item description"/><textarea aria-label={`${meta.label} note`} className={`${INPUT_CLASS} mt-2 min-h-16 resize-y py-2`} value={item.note} onChange={event => onChange('note', event.target.value)} placeholder="Assumption or source note (optional)"/></div>
    {item.category === 'INTERNAL_LABOUR' ? <div className="grid gap-2"><select aria-label="Apply organization rate card" className={INPUT_CLASS} value="" onChange={event => { const rate = rateCards.find(entry => entry.rateCardId === event.target.value); if (rate) { onChange('discipline', rate.discipline || 'General'); onChange('employeeGrade', rate.roleName); onChange('unitCostRate', String(rate.internalCostRate)); } }}><option value="">Apply rate card…</option>{rateCards.map(rate => <option key={rate.rateCardId} value={rate.rateCardId}>{rate.roleName} · {rate.internalCostRate}</option>)}</select><input aria-label="Discipline" className={INPUT_CLASS} value={item.discipline} onChange={event => onChange('discipline', event.target.value)} placeholder="Discipline"/><input aria-label="Employee grade" className={INPUT_CLASS} value={item.employeeGrade} onChange={event => onChange('employeeGrade', event.target.value)} placeholder="Grade"/></div> : <input aria-label="Supplier" className={INPUT_CLASS} value={item.supplierName} onChange={event => onChange('supplierName', event.target.value)} placeholder="Supplier"/>}
    <input aria-label="Unit" className={INPUT_CLASS} value={item.unit} onChange={event => onChange('unit', event.target.value)} placeholder="Unit"/>
    <input aria-label="Quantity" inputMode="decimal" className={`${INPUT_CLASS} text-right font-mono`} value={item.quantity} onChange={event => onChange('quantity', event.target.value)} placeholder="0"/>
    <input aria-label="Cost rate" inputMode="decimal" className={`${INPUT_CLASS} text-right font-mono`} value={item.unitCostRate} onChange={event => onChange('unitCostRate', event.target.value)} placeholder="0.00"/>
    <div className="min-h-10 px-2 py-2.5 text-right font-mono text-sm font-bold text-ui-primary">{amount == null ? '—' : amount}</div>
    <div className="min-h-10 px-2 py-2.5 text-xs font-semibold text-ui-muted">{meta.short}</div>
    <button type="button" onClick={onRemove} aria-label={`Remove ${item.description || 'estimate line'}`} className="grid size-10 place-items-center rounded-lg text-lg text-ui-muted hover:bg-ui-danger-subtle hover:text-ui-danger">×</button>
  </div>;
}

function EstimateEditor({ estimate, opportunities, estimateCount, initialOpportunityId, saving, onSave, onClose, createItem, rateCards }) {
  const [draft, setDraft] = useState(() => estimate ? normalizeEstimate(estimate) : newEstimate(opportunities, estimateCount, initialOpportunityId, createItem));
  const [validation, setValidation] = useState(null);
  const calculation = useEstimateCalculation(draft.items);
  const selectedOpportunity = opportunities.find(item => item.opportunityId === draft.opportunityId);

  function update(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function selectOpportunity(opportunityId) {
    const opportunity = opportunities.find(item => item.opportunityId === opportunityId);
    setDraft(current => ({ ...current, opportunityId, currencyCode: opportunity?.currencyCode || current.currencyCode }));
  }

  function updateItem(id, field, value) {
    setDraft(current => ({ ...current, items: current.items.map(item => item.id === id ? { ...item, [field]: value } : item) }));
  }

  function addItem(category) {
    setDraft(current => ({ ...current, items: [...current.items, createItem(category)] }));
  }

  function removeItem(id) {
    setDraft(current => ({ ...current, items: current.items.filter(item => item.id !== id) }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.opportunityId || !draft.estimateNumber.trim() || !draft.title.trim() || !calculation.valid) {
      setValidation('Complete the estimate header and every required line field. Quantity must be greater than zero; cost rate may be zero.');
      return;
    }
    setValidation(null);
    try {
      await onSave(draft);
    } catch {
      // The page-level command wrapper keeps the editor open and shows a toast.
    }
  }

  return <div className="fixed inset-0 z-50 bg-ui-page" role="dialog" aria-modal="true" aria-labelledby="estimate-editor-title">
    <form className="flex h-full min-h-0 flex-col" onSubmit={submit}>
      <header className="flex flex-col gap-4 border-b border-ui-border bg-ui-surface px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4"><button type="button" onClick={onClose} aria-label="Close estimate editor" className="grid size-10 shrink-0 place-items-center rounded-lg border border-ui-border text-xl text-ui-muted hover:bg-ui-elevated">×</button><div className="min-w-0"><span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ui-accent">Internal delivery cost</span><h2 id="estimate-editor-title" className="truncate text-xl font-bold text-ui-primary">{estimate ? 'Edit estimate' : 'New estimate'}</h2></div></div>
        <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-ui-muted">Calculated delivery cost</span><strong className="text-lg text-ui-primary">{formatMoney(calculation.totals.estimatedDeliveryCost, draft.currencyCode)}</strong><SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton><PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save estimate'}</PrimaryButton></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1480px] gap-5 p-4 md:p-6">
          <section className="grid gap-4 rounded-ui border border-ui-border bg-ui-surface p-4 lg:grid-cols-[1.3fr_1.3fr_0.8fr_0.8fr]">
            <FormField label="Opportunity" required><select className={INPUT_CLASS} value={draft.opportunityId} onChange={event => selectOpportunity(event.target.value)}><option value="">Select opportunity</option>{opportunities.map(item => <option key={item.opportunityId} value={item.opportunityId}>{item.opportunityNumber} · {item.title}</option>)}</select></FormField>
            <FormField label="Estimate title" required><input className={INPUT_CLASS} value={draft.title} onChange={event => update('title', event.target.value)} maxLength={240}/></FormField>
            <FormField label="Estimate number" required><input className={INPUT_CLASS} value={draft.estimateNumber} onChange={event => update('estimateNumber', event.target.value.toUpperCase())} maxLength={40}/></FormField>
            <FormField label="Status" required><select className={INPUT_CLASS} value={draft.status} onChange={event => update('status', event.target.value)}>{ESTIMATE_STATUSES.map(value => <option key={value}>{value}</option>)}</select></FormField>
            <div className="lg:col-span-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-ui-border pt-3 text-xs text-ui-muted"><span>Client: <strong className="text-ui-secondary">{selectedOpportunity?.clientName || '—'}</strong></span><span>Currency: <strong className="text-ui-secondary">{draft.currencyCode}</strong></span><span>Revision: <strong className="text-ui-secondary">{draft.expectedRevision || 0}</strong></span></div>
          </section>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Internal labour', calculation.totals.internalLabourCost],
              ['External cost', calculation.totals.externalCost],
              ['Other direct cost', calculation.totals.otherDirectCost],
              ['Estimated delivery cost', calculation.totals.estimatedDeliveryCost],
            ].map(([label, value], index) => <article key={label} className={`rounded-ui border p-4 ${index === 3 ? 'border-ui-accent bg-ui-accent-subtle' : 'border-ui-border bg-ui-surface'}`}><span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-ui-muted">{label}</span><strong className="mt-2 block text-lg text-ui-primary">{formatMoney(value, draft.currencyCode)}</strong></article>)}
          </section>
          {Object.entries(CATEGORY_META).map(([category, meta]) => {
            const lines = calculation.lines.filter(item => item.category === category);
            return <section key={category} className="overflow-hidden rounded-ui border border-ui-border bg-ui-surface">
              <header className="flex flex-col gap-3 border-b border-ui-border bg-ui-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-ui-primary">{meta.label}</h3><p className="mt-0.5 text-xs text-ui-muted">{meta.description}</p></div><SecondaryButton onClick={() => addItem(category)}><Icon name="plus"/>Add line</SecondaryButton></header>
              <div className="overflow-x-auto"><div className="grid min-w-[1060px] grid-cols-[minmax(220px,2fr)_150px_135px_90px_95px_130px_130px_44px] gap-2 bg-ui-surface px-4 py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-ui-muted"><span>Description / note</span><span>{category === 'INTERNAL_LABOUR' ? 'Rate card / grade' : 'Supplier'}</span><span>Unit</span><span className="text-right">Quantity</span><span className="text-right">Cost rate</span><span className="text-right">Line amount</span><span>Category</span><span/></div>{lines.map(item => <EstimateLine key={item.id} item={item} amount={item.amount} onChange={(field, value) => updateItem(item.id, field, value)} onRemove={() => removeItem(item.id)} rateCards={rateCards.filter(rate => rate.status === 'ACTIVE' && rate.currencyCode === draft.currencyCode)}/>)}</div>
              {lines.length === 0 ? <div className="px-4 py-6 text-center text-xs text-ui-muted">No {meta.label.toLowerCase()} lines. Add one when this estimate requires it.</div> : null}
            </section>;
          })}
          {validation ? <InlineAlert>{validation}</InlineAlert> : null}
          <p className="text-xs leading-5 text-ui-muted">Amounts are calculated as quantity × internal cost rate. Exact calculation uses the OpenDay Estimate Engine; internal rates and totals remain confidential to your organization.</p>
        </div>
      </div>
    </form>
  </div>;
}

export default function EstimateWorkspace({ opportunities, estimates, rateCards = [], saving, onSave, createItem, initialOpportunityId = null }) {
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(() => initialOpportunityId ? { mode: 'new', opportunityId: initialOpportunityId } : null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const opportunityById = useMemo(() => new Map(opportunities.map(item => [item.opportunityId, item])), [opportunities]);
  const filtered = useMemo(() => estimates.filter(item => !deferredQuery || `${item.estimateNumber} ${item.title} ${opportunityById.get(item.opportunityId)?.clientName || ''}`.toLowerCase().includes(deferredQuery)), [estimates, deferredQuery, opportunityById]);

  async function save(draft) {
    await onSave(draft);
    setEditor(null);
  }

  const createDisabled = opportunities.length === 0;
  return <Surface elevated>
    <div className="flex flex-col gap-3 border-b border-ui-border p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-base font-bold text-ui-primary">Delivery estimate register</h2><p className="mt-1 text-xs text-ui-muted">{estimates.length} versioned internal estimates</p></div><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Search estimates" className={`${INPUT_CLASS} sm:w-72`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search estimate, title or client"/><PrimaryButton disabled={createDisabled} onClick={() => setEditor({ mode: 'new' })}><Icon name="plus"/>New estimate</PrimaryButton></div></div>
    {estimates.length === 0 ? <EmptyState title={createDisabled ? 'Create an opportunity first' : 'No estimates started'} body={createDisabled ? 'Every internal delivery estimate must have a qualified pipeline source. Add an opportunity before building cost.' : 'Build the expected internal labour, external supplier and other direct delivery cost for an opportunity.'} action={createDisabled ? null : <PrimaryButton onClick={() => setEditor({ mode: 'new' })}><Icon name="plus"/>Create estimate</PrimaryButton>}/> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] border-collapse text-left"><thead className="bg-ui-elevated text-[10px] font-extrabold uppercase tracking-[0.08em] text-ui-muted"><tr><th className="px-4 py-3">Estimate</th><th className="px-4 py-3">Opportunity / client</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Labour</th><th className="px-4 py-3 text-right">External + other</th><th className="px-4 py-3 text-right">Delivery cost</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody>{filtered.map(item => { const opportunity = opportunityById.get(item.opportunityId); return <tr key={item.estimateId} className="border-t border-ui-border text-sm transition hover:bg-ui-elevated"><td className="px-4 py-3"><strong className="block text-ui-primary">{item.title}</strong><span className="mt-0.5 block text-xs font-semibold text-ui-accent">{item.estimateNumber} · R{item.revision}</span></td><td className="px-4 py-3"><span className="block text-ui-secondary">{opportunity?.title || 'Unknown opportunity'}</span><small className="text-ui-muted">{opportunity?.clientName || '—'}</small></td><td className="px-4 py-3"><StatusBadge value={item.status}/></td><td className="px-4 py-3 text-right font-mono text-xs text-ui-secondary">{formatMoney(item.internalLabourCost, item.currencyCode)}</td><td className="px-4 py-3 text-right font-mono text-xs text-ui-secondary">{formatMoney(item.externalAndOtherCost, item.currencyCode)}</td><td className="px-4 py-3 text-right font-mono text-sm font-bold text-ui-primary">{formatMoney(item.estimatedDeliveryCost, item.currencyCode)}</td><td className="px-4 py-3 text-right"><SecondaryButton onClick={() => setEditor({ mode: 'edit', item })}>Open estimate</SecondaryButton></td></tr>; })}</tbody></table>{filtered.length === 0 ? <p className="p-8 text-center text-sm text-ui-muted">No estimates match the current search.</p> : null}</div>}
    {editor ? <EstimateEditor key={editor.item?.estimateId || editor.opportunityId || 'new'} estimate={editor.item} opportunities={opportunities} estimateCount={estimates.length} initialOpportunityId={editor.opportunityId} saving={saving} onSave={save} onClose={() => setEditor(null)} createItem={createItem} rateCards={rateCards}/> : null}
  </Surface>;
}
