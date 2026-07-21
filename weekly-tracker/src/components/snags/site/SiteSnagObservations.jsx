import { SNAG_QUICK_VIEWS } from '../../../hooks/snags/useSnagPresentation.js';
import SnagCard from '../SnagCard.jsx';
import SnagFilters from '../SnagFilters.jsx';

export default function SiteSnagObservations({ projectId, status, reload, model, filters, setFilters, selected, setSelected, publish, publishNotice, actor }) {
  const captured = model.rows.filter((row) => row.publicationState === 'CAPTURED');
  const selectQuickView = (view) => setFilters(Object.fromEntries(Object.entries(view.filters).map(([key, value]) => [key, value === '$ACTOR' ? actor.id : value])));

  return (
    <section className="site-snag-observations" aria-labelledby="site-snag-observations-heading">
      <div className="site-snag-section-intro">
        <div><h2 id="site-snag-observations-heading">Observation management</h2><p>Review, filter, publish and open the full history of existing Observations.</p></div>
        <span>{model.total} results</span>
      </div>
      {captured.length && model.canCreate ? (
        <section className="capture-review-bar" aria-label="Captured observations">
          <div><strong>{captured.length} Captured</strong><span>Review responsibility and details before publishing.</span></div>
          <button className="btn btn-primary" disabled={!selected.length || publish.pending} onClick={() => publish.execute({ type: 'batchPublish', projectId, snagIds: selected })}>Publish selected ({selected.length})</button>
          {publishNotice ? <p className="snag-publish-notice" role="alert">{publishNotice}</p> : null}
        </section>
      ) : null}
      <nav className="snag-quick-views" aria-label="Observation quick views">
        <button type="button" onClick={() => setFilters({ publicationState: 'CAPTURED' })}>Captured</button>
        {SNAG_QUICK_VIEWS.map((view) => <button type="button" key={view.label} onClick={() => selectQuickView(view)}>{view.label}</button>)}
      </nav>
      <SnagFilters filters={filters} onChange={setFilters} onReset={() => setFilters({})} />
      {status === 'loading' ? <div className="snag-skeleton-list" role="status">Loading Observations…</div> : null}
      {status === 'error' ? <div className="snag-error" role="alert"><p>Observations could not be loaded.</p><button className="btn" onClick={reload}>Retry</button></div> : null}
      {status === 'ready' && model.rows.length === 0 ? <div className="empty-state"><h2>No matching Observations</h2><p>Adjust the filters or open Field Snag List to capture work on site.</p></div> : null}
      <div className="snag-list">
        {model.rows.map((snag) => (
          <div key={snag.id} className="observation-list-row">
            {snag.publicationState === 'CAPTURED' && model.canCreate ? <label className="observation-select"><input type="checkbox" checked={selected.includes(snag.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, snag.id] : current.filter((id) => id !== snag.id))} /><span>Select Observation #{snag.snagNumber}</span></label> : null}
            <SnagCard snag={snag} />
          </div>
        ))}
      </div>
    </section>
  );
}
