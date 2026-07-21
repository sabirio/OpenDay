import { useState } from 'react';
import { SNAG_QUICK_VIEWS } from '../../../hooks/snags/useSnagPresentation.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import SnagFieldCard from './SnagFieldCard.jsx';
import SnagFieldFilterSheet from './SnagFieldFilterSheet.jsx';

// Field-friendly List mode: cards instead of the desktop table, quick
// views + a compact "Filters (N)" trigger instead of a row of dropdowns.
// Data/model come from the same useProjectSnags + buildSnagListModel used
// by the desktop SnagListPage (passed down as props) — this view adds no
// fetching or filtering logic of its own beyond the same client-side search
// the desktop list already does.
export default function SnagFieldListView({ projectId, status, reload, model, filters, setFilters, selected, setSelected, publish, publishNotice, catalog }) {
  const { user } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const searched = model.rows.filter(row => !filters.search || `${row.title} ${row.locationLabel}`.toLowerCase().includes(filters.search.toLowerCase()));
  const captured = searched.filter(row => row.publicationState === 'CAPTURED');
  const activeCount = Object.values(filters).filter(Boolean).length;
  const navOrder = searched.map(item => item.id);
  const selectQuickView = view => setFilters(Object.fromEntries(Object.entries(view.filters).map(([key, value]) => [key, value === '$ACTOR' ? user?.id : value])));
  const tradeName = tradeId => catalog.trades.find(item => item.id === tradeId)?.name || null;
  const stakeholderName = stakeholderId => catalog.stakeholders.find(item => item.id === stakeholderId)?.company_name || null;

  return (
    <div className="snag-field-list">
      <div className="snag-field-list-toolbar">
        <nav className="snag-quick-views" aria-label="Quick views">
          <button type="button" onClick={() => setFilters({ publicationState: 'CAPTURED' })}>Captured</button>
          {SNAG_QUICK_VIEWS.map(view => <button type="button" key={view.label} onClick={() => selectQuickView(view)}>{view.label}</button>)}
        </nav>
        <button type="button" className="btn snag-field-filter-trigger" onClick={() => setSheetOpen(true)}>
          Filters{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      {model.canCreate && captured.length ? (
        <section className="capture-review-bar snag-field-capture-bar" aria-label="Captured observations">
          <div><strong>{captured.length} Captured</strong><span>Review responsibility and details before publishing.</span></div>
          <button className="btn btn-primary" disabled={!selected.length || publish.pending} onClick={() => publish.execute({ type: 'batchPublish', projectId, snagIds: selected })}>
            Publish selected ({selected.length})
          </button>
          {publishNotice ? <p className="snag-publish-notice" role="alert">{publishNotice}</p> : null}
        </section>
      ) : null}

      {status === 'loading' ? <div className="snag-skeleton-list" role="status" aria-live="polite">Loading observations…</div> : null}
      {status === 'error' ? (
        <div className="snag-error" role="alert">
          <p>Observations could not be loaded.</p>
          <button className="btn" onClick={reload}>Retry</button>
        </div>
      ) : null}
      {status === 'ready' && searched.length === 0 ? (
        <div className="empty-state">
          <h2>No matching observations</h2>
          <p>Open the Plan tab to capture the first field observation.</p>
        </div>
      ) : null}

      <div className="snag-field-cards">
        {searched.map(snag => (
          <div key={snag.id} className="snag-field-card-row">
            {snag.publicationState === 'CAPTURED' && model.canCreate ? (
              <label className="observation-select snag-field-select">
                <input
                  type="checkbox"
                  checked={selected.includes(snag.id)}
                  onChange={event => setSelected(current => event.target.checked ? [...current, snag.id] : current.filter(id => id !== snag.id))}
                />
                <span>Select Observation #{snag.snagNumber}</span>
              </label>
            ) : null}
            <SnagFieldCard snag={snag} tradeName={tradeName(snag.tradeId)} stakeholderName={stakeholderName(snag.stakeholderId)} navOrder={navOrder} returnTo={`/projects/${projectId}/snags/field?tab=list`} />
          </div>
        ))}
      </div>

      {sheetOpen ? (
        <SnagFieldFilterSheet
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters({})}
          onClose={() => setSheetOpen(false)}
          activeCount={activeCount}
        />
      ) : null}
    </div>
  );
}
