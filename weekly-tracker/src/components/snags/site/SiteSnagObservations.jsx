import { useMemo } from 'react';
import Icon from '../../shared/Icon.jsx';
import { SnagStatus } from '../SnagStatus.jsx';
import SnagFilters from '../SnagFilters.jsx';
import { SNAG_QUICK_VIEWS, QUICK_VIEW_OWNED_KEYS, countSnagQuickViews, buildSiteSnagOverview } from '../../../hooks/snags/useSnagPresentation.js';

function mapQuickViewFilters(view, actor) {
  return Object.fromEntries(Object.entries(view.filters).map(([key, value]) => [key, value === '$ACTOR' ? actor?.id : value]));
}

function isQuickViewActive(view, filters, actor) {
  const mapped = mapQuickViewFilters(view, actor);
  return QUICK_VIEW_OWNED_KEYS.every((key) => (filters[key] ?? null) === (mapped[key] ?? null));
}

function ObservationRow({ snag, catalog, selected, onSelect }) {
  const stakeholder = catalog.stakeholders.find((item) => String(item.id) === String(snag.stakeholderId));
  const responsible = stakeholder?.company_name || stakeholder?.name || 'Not assigned';

  return (
    <button
      type="button"
      className={selected ? 'master-list-row site-snag-master-row is-selected' : 'master-list-row site-snag-master-row'}
      aria-pressed={selected}
      onClick={() => onSelect(snag)}
      data-testid="site-snag-master-row"
      data-snag-id={String(snag.id)}
    >
      <span className="master-row-top">
        <strong>SN-{snag.snagNumber}</strong>
        <SnagStatus status={snag.status} label={snag.statusLabel} tone={snag.statusTone} />
      </span>
      <span className="master-row-name" title={snag.title}>{snag.title}</span>
      <span className="master-row-bottom">
        <span title={responsible}>{responsible}</span>
        <span>{snag.dueStateLabel} · {snag.dueDateLabel}</span>
      </span>
    </button>
  );
}

function Breakdown({ title, items }) {
  return (
    <section className="site-snag-breakdown" aria-labelledby={`${title.replaceAll(' ', '-').toLowerCase()}-heading`}>
      <h3 id={`${title.replaceAll(' ', '-').toLowerCase()}-heading`}>{title}</h3>
      {items.length === 0 ? <p>No Observation data is available.</p> : (
        <ol>
          {items.map((item) => (
            <li key={item.label}>
              <div><span>{item.label}</span><strong>{item.count}</strong></div>
              <span className="site-snag-breakdown-track" aria-hidden="true">
                <span style={{ width: `${item.relativePercent}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function SiteSnagObservations({ projectId, status, reload, model, filters, setFilters, selected, setSelected, publish, publishNotice, actor, items, catalog, selectedSnagId, onSelect }) {
  const captured = model.rows.filter((row) => row.publicationState === 'CAPTURED');
  const quickCounts = useMemo(() => countSnagQuickViews(items, actor), [items, actor]);
  const overview = useMemo(() => buildSiteSnagOverview(items, catalog), [items, catalog]);
  const hasBreakdownData = overview.byTrade.length > 0 || overview.byStakeholder.length > 0;

  function selectQuickView(view) {
    const mapped = mapQuickViewFilters(view, actor);
    setFilters((current) => {
      const preserved = Object.fromEntries(Object.entries(current).filter(([key]) => !QUICK_VIEW_OWNED_KEYS.includes(key)));
      return { ...preserved, ...mapped };
    });
  }

  return (
    <>
      <div className="master-pane-header site-snag-master-header">
        <h2 className="master-pane-title">Observations</h2>
        <label className="master-search">
          <span className="sr-only">Search Observations</span>
          <Icon name="search" size={15} />
          <input
            className="ds-input"
            value={filters.search || ''}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search title or location..."
          />
        </label>
        <div className="master-quick-filters" role="group" aria-label="Observation quick views">
          {SNAG_QUICK_VIEWS.map((view) => (
            <button
              type="button"
              key={view.label}
              className={isQuickViewActive(view, filters, actor) ? 'master-quick-filter is-active' : 'master-quick-filter'}
              aria-pressed={isQuickViewActive(view, filters, actor)}
              onClick={() => selectQuickView(view)}
            >
              {view.label} <span>{quickCounts[view.label] ?? 0}</span>
            </button>
          ))}
        </div>
        <details className="snag-disclosure">
          <summary className="btn btn-secondary">Filters</summary>
          <SnagFilters filters={filters} onChange={setFilters} onReset={() => setFilters({})} showSearch={false} />
        </details>
        {hasBreakdownData ? (
          <details className="snag-disclosure">
            <summary className="btn btn-secondary">Breakdown</summary>
            <div className="site-snag-breakdowns">
              <Breakdown title="By Trade" items={overview.byTrade} />
              <Breakdown title="By Stakeholder" items={overview.byStakeholder} />
            </div>
          </details>
        ) : null}
      </div>

      {captured.length && model.canCreate ? (
        <section className="capture-review-bar" aria-label="Captured observations">
          <div><strong>{captured.length} Captured</strong><span>Review responsibility and details before publishing.</span></div>
          <button className="btn btn-primary" disabled={!selected.length || publish.pending} onClick={() => publish.execute({ type: 'batchPublish', projectId, snagIds: selected })}>Publish selected ({selected.length})</button>
          {publishNotice ? <p className="snag-publish-notice" role="alert">{publishNotice}</p> : null}
        </section>
      ) : null}

      <div className="master-pane-list" aria-label="Observations">
        <div className="master-list-label">
          <span>Observation list</span>
          <span>{model.total}</span>
        </div>
        {status === 'loading' ? <div className="master-list-empty" role="status">Loading Observations…</div> : null}
        {status === 'error' ? (
          <div className="snag-error" role="alert">
            <p>Observations could not be loaded.</p>
            <button className="btn" onClick={reload}>Retry</button>
          </div>
        ) : null}
        {status === 'ready' && model.rows.length === 0 ? (
          <div className="master-list-empty">No matching Observations. Adjust the filters or open Field Snag List to capture work on site.</div>
        ) : null}
        {model.rows.map((snag) => (
          <div key={snag.id} className="observation-list-row">
            {snag.publicationState === 'CAPTURED' && model.canCreate ? (
              <label className="observation-select">
                <input
                  type="checkbox"
                  checked={selected.includes(snag.id)}
                  onChange={(event) => setSelected((current) => event.target.checked ? [...current, snag.id] : current.filter((id) => id !== snag.id))}
                />
                <span>Select Observation #{snag.snagNumber}</span>
              </label>
            ) : null}
            <ObservationRow snag={snag} catalog={catalog} selected={String(snag.id) === String(selectedSnagId)} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </>
  );
}
