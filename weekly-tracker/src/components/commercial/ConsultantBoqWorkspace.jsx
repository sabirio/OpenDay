function ConsultantBoqLine({ item, editable, onQuantity, onCustom, onRemove }) {
  return (
    <tr className={item.itemKind === 'CUSTOM' ? 'consultant-boq-custom' : ''}>
      <td>
        {item.itemKind === 'CUSTOM' && editable ? (
          <input aria-label="Custom item description" value={item.description} onChange={event => onCustom(item.lineId, { description: event.target.value })} />
        ) : item.description}
      </td>
      <td className="consultant-boq-unit">
        {item.itemKind === 'CUSTOM' && editable ? (
          <input aria-label="Custom item unit" value={item.unit} onChange={event => onCustom(item.lineId, { unit: event.target.value })} />
        ) : item.unit}
      </td>
      <td className="consultant-boq-quantity">
        <input aria-label={`Consultant quantity for ${item.description || 'custom item'}`} inputMode="decimal" value={item.consultantQuantity} disabled={!editable} onChange={event => onQuantity(item.lineId, event.target.value)} />
      </td>
      <td className="consultant-boq-line-action">
        {item.itemKind === 'CUSTOM' && editable ? <button type="button" className="btn btn-secondary" onClick={() => onRemove(item.lineId)}>Remove</button> : null}
      </td>
    </tr>
  );
}

export default function ConsultantBoqWorkspace({ draft, presentation, busy, onPatchQuantity, onPatchDraft, onAddCustom, onPatchCustom, onRemoveCustom, onSave, onSubmit, onReview }) {
  const { assessment } = presentation;
  return (
    <div className="consultant-boq-workspace">
      <header className="consultant-boq-sticky">
        <div>
          <p className="eyebrow">Consultant measured</p>
          <h1>{presentation.heading}</h1>
          <p>{presentation.projectLabel}</p>
        </div>
        <div className="consultant-boq-statuses">
          <span>{presentation.statusLabel}</span>
          <span>{presentation.revisionLabel}</span>
          <span>{assessment.lineCount} lines</span>
        </div>
      </header>

      {assessment.missingQuantity > 0 ? <div className="consultant-boq-message">{assessment.missingQuantity} quantities remain empty. Draft saving is allowed; Submit becomes available when all quantities are complete.</div> : null}
      {assessment.invalidCustom > 0 ? <div className="consultant-boq-message consultant-boq-error">Complete Description and Unit for every custom line.</div> : null}

      {presentation.disciplines.map(discipline => (
        <details key={discipline.code} className="consultant-boq-discipline">
          <summary><strong>{discipline.code}</strong><span>{discipline.label}</span><small>{discipline.lineCount} lines</small></summary>
          {discipline.workGroups.map(group => (
            <section key={group.id} className="consultant-boq-group">
              <div className="consultant-boq-group-heading">
                <div><strong>{group.code}</strong><span>{group.label}</span></div>
                {assessment.canEdit ? <button type="button" className="btn btn-secondary" onClick={() => onAddCustom(group.id)}>+ Add custom line</button> : null}
              </div>
              <div className="consultant-boq-table-scroll">
                <table>
                  <thead><tr><th>Item</th><th>Unit</th><th>Qty by Consultant</th><th aria-label="Actions" /></tr></thead>
                  <tbody>{group.items.map(item => <ConsultantBoqLine key={item.lineId} item={item} editable={assessment.canEdit} onQuantity={onPatchQuantity} onCustom={onPatchCustom} onRemove={onRemoveCustom} />)}</tbody>
                </table>
              </div>
            </section>
          ))}
        </details>
      ))}

      <footer className="consultant-boq-actions">
        {assessment.canEdit ? <label>Revision note<input value={draft.revisionNote} onChange={event => onPatchDraft({ revisionNote: event.target.value })} placeholder="Optional" /></label> : null}
        {assessment.canReview ? <label>Review note<input value={draft.reviewNote} onChange={event => onPatchDraft({ reviewNote: event.target.value })} placeholder="Required when returning" /></label> : null}
        <div>
          {assessment.canReview ? <button type="button" className="btn btn-secondary" disabled={busy || !assessment.canReturn} onClick={() => onReview('RETURN')}>Return to Consultant</button> : null}
          {assessment.canReview ? <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onReview('ACCEPT')}>Accept &amp; Freeze BOQ</button> : null}
          {assessment.canEdit ? <button type="button" className="btn btn-secondary" disabled={busy || !assessment.canSave} onClick={onSave}>Save revision</button> : null}
          {assessment.canEdit ? <button type="button" className="btn btn-primary" disabled={busy || !assessment.canSubmit} onClick={onSubmit}>Submit to PM</button> : null}
        </div>
      </footer>
    </div>
  );
}
