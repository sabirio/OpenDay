import { Fragment, useState } from 'react';
import { useIsMobile } from '../../hooks/shared/useViewport.js';
import { describeRowStatus, describeLocation, describeMoney, describeDate } from '../../hooks/import/useImportWorkflow.js';

const FILTERS = [
  { id: 'all', label: 'All', countKey: 'total' },
  { id: 'ready', label: 'Ready', countKey: 'create' },
  { id: 'exists', label: 'Already exists', countKey: 'skip' },
  { id: 'attention', label: 'Needs attention', countKey: 'blocked' },
  { id: 'warnings', label: 'Warnings', countKey: 'warnings' },
];

function matchesFilter(row, filter) {
  if (filter === 'ready') return row.action === 'CREATE';
  if (filter === 'exists') return row.action === 'SKIP';
  if (filter === 'attention') return row.action === 'BLOCK';
  if (filter === 'warnings') return row.warnings.length > 0;
  return true;
}

function RowDetail({ row }) {
  if (row.errors.length === 0 && row.warnings.length === 0) return null;
  // The warning heading reflects this row's own status — a SKIP row's
  // warning is its "already exists" notice, not a CREATE-with-warning claim.
  const warningHeading = row.action === 'CREATE' ? 'Ready with warning' : 'Note';
  return (
    <div className="import-row-detail">
      {row.errors.length > 0 ? (
        <div>
          <strong>Needs attention</strong>
          <ul>{row.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      ) : null}
      {row.warnings.length > 0 ? (
        <div>
          <strong>{warningHeading}</strong>
          <ul>{row.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export default function PreviewStep({ plan, previewFilter, onSetFilter, onBackToMapping, onImport, commitState, commitError }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(() => new Set());
  const rows = plan.rows.filter(row => matchesFilter(row, previewFilter));
  const toggleExpanded = (sourceRow) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(sourceRow)) next.delete(sourceRow); else next.add(sourceRow);
    return next;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="import-summary-cards">
        <div className="card import-summary-card"><span className="value">{plan.summary.total}</span><span className="label">Total</span></div>
        <div className="card import-summary-card import-summary-card--success"><span className="value">{plan.summary.create}</span><span className="label">Ready</span></div>
        <div className="card import-summary-card import-summary-card--neutral"><span className="value">{plan.summary.skip}</span><span className="label">Already exists</span></div>
        <div className="card import-summary-card import-summary-card--danger"><span className="value">{plan.summary.blocked}</span><span className="label">Needs attention</span></div>
        <div className="card import-summary-card import-summary-card--warning"><span className="value">{plan.summary.warnings}</span><span className="label">Warnings</span></div>
      </div>

      <div className="import-filter-row" role="group" aria-label="Filter rows by status">
        {FILTERS.map(filter => (
          <button
            key={filter.id}
            type="button"
            className="import-filter-chip"
            aria-pressed={previewFilter === filter.id}
            onClick={() => onSetFilter(filter.id)}
          >
            {filter.label} ({plan.summary[filter.countKey]})
          </button>
        ))}
      </div>

      {isMobile ? (
        <div className="import-preview-cards">
          {rows.map(row => {
            const status = describeRowStatus(row.action);
            const isOpen = expanded.has(row.sourceRow);
            return (
              <div className="card import-preview-card" key={row.sourceRow}>
                <div className="import-preview-card-top">
                  <span className="import-preview-card-code">{row.normalized.store_code || '—'}</span>
                  <span className={`import-row-status import-row-status--${status.tone}`}>{status.label}</span>
                </div>
                <div className="import-preview-card-meta">
                  <span>{row.normalized.country || '—'}, {row.normalized.city || '—'}</span>
                  <span>{describeLocation(row.normalized)}</span>
                  <span>{row.normalized.project_type || '—'}</span>
                  <span>{describeMoney(row.normalized.budget, row.normalized.currency_code)}</span>
                </div>
                {(row.errors.length > 0 || row.warnings.length > 0) ? (
                  <button type="button" className="btn-ghost-sm" onClick={() => toggleExpanded(row.sourceRow)} aria-expanded={isOpen}>
                    {isOpen ? 'Hide details' : 'Show details'}
                  </button>
                ) : null}
                {isOpen ? <RowDetail row={row} /> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th scope="col" className="import-status-col">Status</th>
                <th scope="col">Store Code</th>
                <th scope="col">Country</th>
                <th scope="col">City</th>
                <th scope="col">Location</th>
                <th scope="col">Project Type</th>
                <th scope="col">Store Concept</th>
                <th scope="col">Total Area</th>
                <th scope="col">Actual Opening</th>
                <th scope="col">Budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const status = describeRowStatus(row.action);
                const isOpen = expanded.has(row.sourceRow);
                const hasDetail = row.errors.length > 0 || row.warnings.length > 0;
                return (
                  <Fragment key={row.sourceRow}>
                    <tr className={row.action === 'BLOCK' ? 'row--alert' : undefined}>
                      <td className="import-status-col">
                        <span className={`import-row-status import-row-status--${status.tone}`}>{status.label}</span>
                        {hasDetail ? (
                          <button type="button" className="btn-ghost-sm" style={{ marginLeft: 8 }} onClick={() => toggleExpanded(row.sourceRow)} aria-expanded={isOpen}>
                            {isOpen ? 'Hide' : 'Details'}
                          </button>
                        ) : null}
                      </td>
                      <td>{row.normalized.store_code || '—'}</td>
                      <td>{row.normalized.country || '—'}</td>
                      <td>{row.normalized.city || '—'}</td>
                      <td>{describeLocation(row.normalized)}</td>
                      <td>{row.normalized.project_type || '—'}</td>
                      <td>{row.normalized.store_concept || '—'}</td>
                      <td>{row.normalized.store_size_sqm != null ? `${row.normalized.store_size_sqm} m²` : '—'}</td>
                      <td>{describeDate(row.normalized.actual_opening_date)}</td>
                      <td>{describeMoney(row.normalized.budget, row.normalized.currency_code)}</td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={10}><RowDetail row={row} /></td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {commitError ? (
        <div className="import-alert import-alert--danger" role="alert"><strong>{commitError}</strong></div>
      ) : null}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          {plan.summary.create} will be created · {plan.summary.skip} already exist and will be skipped · {plan.summary.blocked} blocked rows will not be imported
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onBackToMapping} disabled={commitState === 'committing'}>Back to mapping</button>
          <button type="button" className="btn btn-primary" onClick={onImport} disabled={commitState === 'committing' || plan.summary.create === 0}>
            {commitState === 'committing' ? 'Importing projects…' : `Import ${plan.summary.create} projects`}
          </button>
        </div>
      </div>
    </div>
  );
}
