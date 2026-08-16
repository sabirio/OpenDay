import { useRef, useState } from 'react';
import '../../styles/boqCompact.css';

const issueText = { EMPTY_BOQ: 'Add at least one BOQ line.', DESCRIPTION_REQUIRED: 'Description is required.', UNIT_REQUIRED: 'Unit is required.', INVALID_QUANTITY: 'Contractor Quantity must be blank or greater than zero.', INVALID_CONSULTANT_QUANTITY: 'Enter a valid Consultant Quantity of zero or greater.', INVALID_LABOUR_RATE: 'Enter a valid Labour rate.', INVALID_MATERIAL_RATE: 'Enter a valid Material rate.' };

function InlineIssues({ issues }) {
  if (!issues?.length) return null;
  return <div className="boq-alert boq-alert-danger" role="alert"><strong>Revision cannot be saved.</strong><ul>{issues.slice(0, 8).map((item, index) => <li key={`${item.code}-${index}`}>{item.index != null ? `Row ${item.index + 1}: ` : ''}{issueText[item.code] || item.code}</li>)}</ul></div>;
}

function AddWorkGroupRow({ workGroupId, editor, showConsultantQuantity }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ description: '', unit: '', quantity: '', consultantQuantity: '', labourRate: '', materialRate: '' });
  const reset = () => { setCustom({ description: '', unit: '', quantity: '', consultantQuantity: '', labourRate: '', materialRate: '' }); setOpen(false); };
  if (!open) return <tfoot className="boq-add-row-footer"><tr><td colSpan={showConsultantQuantity ? 10 : 8}><button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>+ Add row</button></td></tr></tfoot>;
  const assessment = editor.inspectCustom(custom);
  return <tfoot className="boq-add-row-footer is-editing"><tr>
    <td><input className="ds-input" autoFocus placeholder="Description" value={custom.description} onChange={event => setCustom(value => ({ ...value, description: event.target.value }))}/></td>
    <td><input className="ds-input" placeholder="Unit" value={custom.unit} onChange={event => setCustom(value => ({ ...value, unit: event.target.value }))}/></td>
    <td><input className="ds-input" inputMode="decimal" placeholder="Contractor Qty" value={custom.quantity} onChange={event => setCustom(value => ({ ...value, quantity: event.target.value }))}/></td>
    {showConsultantQuantity && <td><input className="ds-input" inputMode="decimal" placeholder="Consultant Qty" value={custom.consultantQuantity} onChange={event => setCustom(value => ({ ...value, consultantQuantity: event.target.value }))}/></td>}
    {showConsultantQuantity && <td className={`boq-variance ${assessment.presentation.quantityVarianceTone}`}>{assessment.presentation.quantityVarianceDisplay ?? '—'}</td>}
    <td><input className="ds-input" inputMode="decimal" placeholder="Labour" value={custom.labourRate} onChange={event => setCustom(value => ({ ...value, labourRate: event.target.value }))}/></td>
    <td><input className="ds-input" inputMode="decimal" placeholder="Material" value={custom.materialRate} onChange={event => setCustom(value => ({ ...value, materialRate: event.target.value }))}/></td>
    <td className="boq-total">{assessment.presentation.calculatedTotalDisplay ?? '—'}</td><td/>
    <td className="boq-add-row-buttons"><button className="btn btn-ghost" type="button" onClick={reset}>Cancel</button><button className="btn btn-secondary" type="button" disabled={!assessment.canAdd} onClick={() => { editor.addCustom({ ...custom, workGroupId }); reset(); }}>Add row</button></td>
  </tr></tfoot>;
}

function WorkGroupSection({ group, editor, readOnly, showConsultantQuantity }) {
  return <details className="boq-work-group card">
    <summary><span><strong>{group.code}</strong>{group.label}</span><small>{group.lineCount} lines</small></summary>
    <div className="boq-group-table-wrap"><table className="boq-table boq-table-compact"><thead><tr><th>Item</th><th>Unit</th><th>Qty by Contractor</th>{showConsultantQuantity && <th>Qty by Consultant</th>}{showConsultantQuantity && <th>Variance</th>}<th>Labour</th><th>Material</th><th>Total</th><th>Note</th>{!readOnly && <th aria-label="Actions"/>}</tr></thead><tbody>{group.items.map(item => <tr key={item.lineId} className={item.isCustom ? 'is-custom' : undefined}>
      <td>{item.isStandard ? <span className="boq-description">{item.description}</span> : <input className="ds-input boq-custom-description" aria-label="Custom item description" disabled={readOnly} value={item.description} onChange={event => editor.patchItem(item.lineId, { description: event.target.value })}/>}</td>
      <td>{item.isStandard ? <span>{item.unit}</span> : <input className="ds-input boq-unit" disabled={readOnly} value={item.unit} onChange={event => editor.patchItem(item.lineId, { unit: event.target.value })}/>}</td>
      <td><input className="ds-input boq-number" aria-label={`Contractor Quantity for ${item.description}`} disabled={readOnly} inputMode="decimal" value={item.quantity ?? ''} placeholder="—" onChange={event => editor.patchDecimal(item.lineId, 'quantity', event.target.value)}/></td>
      {showConsultantQuantity && <td><input className="ds-input boq-number" aria-label={`Consultant Quantity for ${item.description}`} disabled={readOnly} inputMode="decimal" value={item.consultantQuantity ?? ''} placeholder="—" onChange={event => editor.patchDecimal(item.lineId, 'consultantQuantity', event.target.value)}/></td>}
      {showConsultantQuantity && <td className={`boq-variance ${item.quantityVarianceTone}`}>{item.quantityVarianceDisplay ?? '—'}</td>}
      <td><input className="ds-input boq-number" aria-label={`Labour for ${item.description}`} disabled={readOnly} inputMode="decimal" value={item.labourRate ?? ''} placeholder="—" onChange={event => editor.patchDecimal(item.lineId, 'labourRate', event.target.value)}/></td>
      <td><input className="ds-input boq-number" aria-label={`Material for ${item.description}`} disabled={readOnly} inputMode="decimal" value={item.materialRate ?? ''} placeholder="—" onChange={event => editor.patchDecimal(item.lineId, 'materialRate', event.target.value)}/></td>
      <td className="boq-total">{item.calculatedTotalDisplay ?? '—'}</td>
      <td><input className="ds-input boq-note" disabled={readOnly} placeholder="Optional" value={item.contractorNote ?? ''} onChange={event => editor.patchItem(item.lineId, { contractorNote: event.target.value })}/></td>
      {!readOnly && <td>{item.isCustom && <button className="btn btn-ghost boq-remove" type="button" aria-label={`Remove ${item.description}`} onClick={() => editor.removeItem(item.lineId)}>Remove</button>}</td>}
    </tr>)}</tbody>{!readOnly && <AddWorkGroupRow workGroupId={group.id} editor={editor} showConsultantQuantity={showConsultantQuantity}/>}</table></div>
  </details>;
}

export default function ProjectBoqEditor({ editor, onExport, onImportSuccess, onSaveSuccess, onSaveError }) {
  const inputRef = useRef(null);
  const { draft, presentation } = editor;
  const { hierarchy, readOnly, showConsultantQuantity } = presentation;
  return <>
    <section className="boq-toolbar card"><div><strong>{presentation.revisionLabel}</strong><span>{presentation.revisionDetail}</span></div><div className="boq-toolbar-actions"><button className="btn btn-secondary" type="button" disabled={!presentation.canExchangeExcel} onClick={onExport}>Export Excel</button><input ref={inputRef} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async event => { const file = event.target.files?.[0]; if (file) await editor.previewImport(file); event.target.value = ''; }}/><button className="btn btn-secondary" type="button" disabled={!presentation.canExchangeExcel} onClick={() => inputRef.current?.click()}>Import Excel</button></div></section>
    {editor.importState.status !== 'idle' && <section className={`boq-alert ${editor.importState.plan?.ok ? 'boq-alert-info' : 'boq-alert-danger'}`} role="status">{editor.importState.plan?.ok ? <><strong>Excel import is valid.</strong><span>{editor.importState.plan.summary.importedLineCount} rows · {editor.importState.plan.summary.addedLineCount} new custom rows.</span><button className="btn btn-primary" type="button" disabled={editor.importState.status === 'committing'} onClick={async () => { const result = await editor.commitImport(); if (result.ok) onImportSuccess?.(); }}>{editor.importState.status === 'committing' ? 'Importing…' : 'Create import revision'}</button></> : <><strong>Excel import blocked.</strong><ul>{(editor.importState.plan?.issues || []).slice(0, 10).map((item, index) => <li key={`${item.code}-${index}`}>{item.rowNumber ? `Row ${item.rowNumber}: ` : ''}{item.code}</li>)}</ul></>}</section>}
    <InlineIssues issues={presentation.issues}/>
    <section className="boq-standard-schedule"><header><div><h2>Standard BOQ</h2><p>Disciplines and Work Groups follow the canonical project order.</p></div><span>{hierarchy.groupCount} Work Groups · {hierarchy.itemCount} lines</span></header>{hierarchy.disciplines.map(discipline => <details className="boq-discipline-section card" key={discipline.id}><summary><strong>{discipline.code}</strong><span>{discipline.label}</span><small>{discipline.groupCount} Work Groups</small></summary><div className="boq-discipline-groups">{discipline.groups.map(group => <WorkGroupSection key={group.id} group={group} editor={editor} readOnly={readOnly} showConsultantQuantity={showConsultantQuantity}/>)}</div></details>)}</section>
    {!readOnly && <section className="boq-savebar"><div><label>Revision note <input className="ds-input" value={draft.revisionNote} onChange={event => editor.patchDraft({ revisionNote: event.target.value })} placeholder="What changed in this revision?"/></label><span>Totals are recalculated when the immutable revision is saved.</span></div><button className="btn btn-secondary" type="button" disabled={!presentation.dirty || editor.saving} onClick={editor.reset}>Discard changes</button><button className="btn btn-primary" type="button" disabled={!presentation.canSave || editor.saving} onClick={async () => { const outcome = await editor.save(); if (outcome.ok) onSaveSuccess?.(outcome); else onSaveError?.(outcome.error); }}>{editor.saving ? 'Saving…' : presentation.saveRevisionLabel}</button></section>}
  </>;
}
