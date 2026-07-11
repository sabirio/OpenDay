function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value || 'Unknown'; }
}

export default function DraftRecoveryBanner({ result, project, onContinue, onDiscard }) {
  if (!result || result.status === 'missing') return null;
  const draft = result.draft;
  const unusable = !draft;
  return (
    <section className="field-form-recovery" aria-labelledby="draft-recovery-title">
      <div>
        <h2 id="draft-recovery-title">{unusable ? 'Saved draft cannot be restored' : 'Unfinished report found'}</h2>
        {unusable ? <p>{result.reason} Remove it to start a safe new report.</p> : (
          <dl>
            <div><dt>Project</dt><dd>{project.storeCode} — {project.shoppingMallName}</dd></div>
            <div><dt>Period</dt><dd>{draft.reportPeriod}</dd></div>
            <div><dt>Last saved</dt><dd>{formatDate(draft.updatedAt)}{result.status === 'stale' ? ' (older draft)' : ''}</dd></div>
            <div><dt>Photos</dt><dd>{draft.evidenceItems.length} uploaded</dd></div>
          </dl>
        )}
      </div>
      <div className="field-form-recovery-actions">
        {!unusable && <button type="button" className="btn-primary" onClick={onContinue}>Continue report</button>}
        <button type="button" className="btn-ghost" onClick={onDiscard}>{unusable ? 'Remove old draft' : 'Discard and start new'}</button>
      </div>
    </section>
  );
}
