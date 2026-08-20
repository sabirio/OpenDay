import { useMemo, useState } from 'react';
import { Button, CONTROL_CLASS, Field, Surface } from '../shared/UiPrimitives.jsx';
import { SectionHeader } from '../shared/LayoutPrimitives.jsx';
import { DataTable, EmptyState, MetricCard, TableHead } from '../shared/UiPatterns.jsx';
import { usePricingCalculation } from '../../hooks/useBusinessDevelopmentWorkspace.js';
import { StatusBadge } from './BusinessDevelopmentShell.jsx';
import { formatMoney, formatPercent } from './formatters.js';

const METHODS = [
  ['TARGET_MARGIN', 'Target margin'], ['COST_PLUS', 'Cost plus'], ['FIXED_PRICE', 'Fixed price'], ['RATE_BASED', 'Rate based'],
];

function PricingEditor({ pricing, estimates, saving, onSave, onClose, createDraft }) {
  const sourceEstimate = estimates.find(item => item.estimateId === (pricing?.estimateId || estimates[0]?.estimateId));
  const [draft, setDraft] = useState(() => pricing ? { ...pricing, expectedRevision: pricing.revision, adjustmentValue: pricing.adjustmentValue ?? '', basisQuantity: pricing.basisQuantity ?? '1', rateAmount: pricing.rateAmount ?? '', fixedPrice: pricing.fixedPrice ?? '', estimatedDeliveryCost: pricing.estimatedDeliveryCost } : { ...createDraft(sourceEstimate), estimatedDeliveryCost: sourceEstimate?.estimatedDeliveryCost || '0.00' });
  const calculation = usePricingCalculation(draft);
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  function chooseEstimate(estimateId) { const estimate = estimates.find(item => item.estimateId === estimateId); setDraft(current => ({ ...current, estimateId, estimatedDeliveryCost: estimate?.estimatedDeliveryCost || '0.00' })); }
  async function submit(event) { event.preventDefault(); try { await onSave(draft); } catch { /* Page toast owns the message. */ } }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
    <form className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-ui border border-ui-border bg-ui-surface shadow-ui-raised" role="dialog" aria-modal="true" aria-labelledby="pricing-editor-title" onSubmit={submit}>
      <SectionHeader className="sticky top-0 z-10 p-5" title={pricing ? 'Edit commercial pricing' : 'New commercial pricing'} description="Selling price is calculated from an approved internal estimate." action={<Button variant="ghost" onClick={onClose}>Close</Button>}/>
      <div className="grid gap-5 p-5">
        <div className="grid gap-4 md:grid-cols-3"><Field label="Approved estimate" required><select className={CONTROL_CLASS} value={draft.estimateId} disabled={Boolean(pricing)} onChange={event => chooseEstimate(event.target.value)}>{estimates.map(item => <option key={item.estimateId} value={item.estimateId}>{item.estimateNumber} · {item.title}</option>)}</select></Field><Field label="Pricing method" required><select className={CONTROL_CLASS} value={draft.pricingMethod} onChange={event => update('pricingMethod', event.target.value)}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Status"><select className={CONTROL_CLASS} value={draft.status} onChange={event => update('status', event.target.value)}><option>DRAFT</option><option>INTERNAL_REVIEW</option><option>APPROVED</option></select></Field></div>
        {draft.pricingMethod === 'TARGET_MARGIN' ? <Field label="Target margin (%)" hint="Selling price = cost ÷ (1 − target margin)."><input inputMode="decimal" className={CONTROL_CLASS} value={draft.adjustmentValue} onChange={event => update('adjustmentValue', event.target.value)}/></Field> : null}
        {draft.pricingMethod === 'COST_PLUS' ? <Field label="Markup on cost (%)" hint="Selling price = cost × (1 + markup)."><input inputMode="decimal" className={CONTROL_CLASS} value={draft.adjustmentValue} onChange={event => update('adjustmentValue', event.target.value)}/></Field> : null}
        {draft.pricingMethod === 'FIXED_PRICE' ? <Field label="Fixed selling price"><input inputMode="decimal" className={CONTROL_CLASS} value={draft.fixedPrice} onChange={event => update('fixedPrice', event.target.value)}/></Field> : null}
        {draft.pricingMethod === 'RATE_BASED' ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Basis quantity" hint="For example gross area in m²."><input inputMode="decimal" className={CONTROL_CLASS} value={draft.basisQuantity} onChange={event => update('basisQuantity', event.target.value)}/></Field><Field label="Selling rate per unit"><input inputMode="decimal" className={CONTROL_CLASS} value={draft.rateAmount} onChange={event => update('rateAmount', event.target.value)}/></Field></div> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Estimated cost" value={formatMoney(calculation.estimatedDeliveryCost, sourceEstimate?.currencyCode)}/><MetricCard label="Selling price" value={calculation.sellingPrice ? formatMoney(calculation.sellingPrice, sourceEstimate?.currencyCode) : '—'} tone="accent"/><MetricCard label="Expected profit" value={calculation.expectedProfit ? formatMoney(calculation.expectedProfit, sourceEstimate?.currencyCode) : '—'}/><MetricCard label="Expected margin" value={calculation.expectedMargin ? formatPercent(calculation.expectedMargin) : '—'} tone={Number(calculation.expectedProfit) < 0 ? 'danger' : 'neutral'}/></section>
        {!calculation.valid ? <p role="alert" className="rounded-ui-sm border border-ui-danger bg-ui-danger-subtle p-3 text-sm text-ui-danger">Complete the selected pricing method inputs.</p> : null}
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-ui-border bg-ui-surface p-4"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={saving || !calculation.valid}>{saving ? 'Saving…' : 'Save pricing'}</Button></footer>
    </form>
  </div>;
}

export default function PricingWorkspace({ estimates, pricings, saving, onSave, createDraft }) {
  const [editor, setEditor] = useState(null);
  const estimateById = useMemo(() => new Map(estimates.map(item => [item.estimateId, item])), [estimates]);
  const approvedAvailable = estimates.some(item => item.status === 'APPROVED' && !pricings.some(pricing => pricing.estimateId === item.estimateId));
  const selectable = estimates.filter(item => item.status === 'APPROVED' && (!pricings.some(pricing => pricing.estimateId === item.estimateId) || editor?.item?.estimateId === item.estimateId));
  async function save(draft) { await onSave(draft); setEditor(null); }
  return <Surface elevated><SectionHeader title="Commercial pricing" description={`${pricings.length} estimate-based pricing records`} action={<Button variant="primary" disabled={!approvedAvailable} onClick={() => setEditor({ mode: 'new' })}>New pricing</Button>}/>
    {pricings.length === 0 ? <EmptyState title={approvedAvailable ? 'No pricing prepared' : 'Approve an estimate first'} body={approvedAvailable ? 'Select an approved delivery estimate and choose cost plus, target margin, fixed price or rate-based pricing.' : 'Pricing is intentionally blocked until internal delivery cost has been approved.'} action={approvedAvailable ? <Button variant="primary" onClick={() => setEditor({ mode: 'new' })}>Create pricing</Button> : null}/> : <DataTable minWidth="940px"><TableHead><tr><th className="px-4 py-3">Estimate</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Delivery cost</th><th className="px-4 py-3 text-right">Selling price</th><th className="px-4 py-3 text-right">Profit / margin</th><th className="px-4 py-3 text-right">Action</th></tr></TableHead><tbody>{pricings.map(item => { const estimate = estimateById.get(item.estimateId); return <tr key={item.pricingId} className="border-t border-ui-border hover:bg-ui-elevated"><td className="px-4 py-3"><strong className="block text-ui-primary">{estimate?.title || 'Unknown estimate'}</strong><small className="text-ui-muted">{estimate?.estimateNumber} · Pricing R{item.revision}</small></td><td className="px-4 py-3 text-ui-secondary">{item.pricingMethod.replaceAll('_', ' ')}</td><td className="px-4 py-3"><StatusBadge value={item.status}/></td><td className="px-4 py-3 text-right font-mono">{formatMoney(item.estimatedDeliveryCost, item.currencyCode)}</td><td className="px-4 py-3 text-right font-mono font-bold text-ui-primary">{formatMoney(item.sellingPrice, item.currencyCode)}</td><td className="px-4 py-3 text-right"><strong className="block text-ui-primary">{formatMoney(item.expectedProfit, item.currencyCode)}</strong><small className="text-ui-muted">{formatPercent(item.expectedMargin)}</small></td><td className="px-4 py-3 text-right"><Button size="sm" onClick={() => setEditor({ mode: 'edit', item })}>Open</Button></td></tr>; })}</tbody></DataTable>}
    {editor ? <PricingEditor pricing={editor.item} estimates={editor.item ? [estimateById.get(editor.item.estimateId)] : selectable} saving={saving} onSave={save} onClose={() => setEditor(null)} createDraft={createDraft}/> : null}
  </Surface>;
}
