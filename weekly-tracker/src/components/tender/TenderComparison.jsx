import { useTenderComparisonPresentation } from '../../hooks/useTenderPresentation.js';

export default function TenderComparison({ workspace }) {
  const model = useTenderComparisonPresentation(workspace);
  const view = model.view;
  if (!view) return null;
  const rows = model.level === 'DISCIPLINE' ? view.disciplineRows : view.categoryRows;
  return <section className="card tender-section tender-comparison">
    <div className="tender-section-heading"><div><h2>Tender Comparison</h2><p>Canonical category comparison with evidence only. Open the line drill-down for quantities, exclusions and contractor-added lines.</p></div><label>Bid round<select className="ds-select" value={view.roundId} onChange={event => model.setRoundId(event.target.value)}>{view.roundOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
    <div className="tender-review-summary">{view.summary.map(item => <div key={item[0]}><span>{item[0]}</span><strong>{item[1]}</strong></div>)}</div>
    <div className={`boq-alert ${view.budget.available ? 'boq-alert-info' : 'boq-alert-danger'}`}><strong>{view.budget.title}</strong><span>{view.budget.detail}</span></div>
    <div className="tender-comparison-levels" role="tablist" aria-label="Comparison level">{view.levels.map(item => <button key={item.id} role="tab" aria-selected={model.level === item.id} className={`btn ${model.level === item.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => model.setLevel(item.id)}>{item.title}</button>)}</div>
    <div className="bidder-boq-table-wrap">{model.level === 'TOTAL' ? <TotalTable rows={view.totalRows}/> : model.level === 'ITEM' ? <ItemTable view={view}/> : <HierarchyTable view={view} rows={rows} discipline={model.level === 'DISCIPLINE'}/>}</div>
    <div className="tender-comparison-legend"><span className="is-lowest">Lowest</span><span className="is-highest">Highest</span><span className="is-anomaly">Rate anomaly at least 20% from median (3+ prices)</span><span className="is-missing">Missing / unpriced</span><span className="is-excluded">Excluded by contractor</span></div>
  </section>;
}

function TotalTable({ rows }) {
  return <table className="bidder-boq-table tender-comparison-table"><thead><tr><th>Bidding organization</th><th>Status</th><th>Total</th><th>vs Approved Budget</th><th>Rank</th><th>vs median</th><th>Missing prices</th><th>Excluded</th><th>Added</th><th>Changed vs prior</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className={row.rowTone}><td><strong>{row.biddingOrganizationName||row.contractorName}</strong></td><td>{row.statusDisplay}</td><td className={row.totalTone}>{row.totalDisplay}</td><td>{row.budgetVarianceDisplay}<small>{row.budgetVariancePctDisplay}</small></td><td>{row.rankDisplay}</td><td>{row.medianDisplay}</td><td>{row.missingDisplay}</td><td>{row.excludedDisplay}</td><td>{row.addedDisplay}</td><td>{row.changedDisplay}</td></tr>)}</tbody></table>;
}

function HierarchyTable({ view, rows, discipline }) {
  return <table className="bidder-boq-table tender-comparison-table tender-comparison-matrix"><thead><tr><th>{discipline ? 'Discipline' : 'Canonical Category'}</th><th>Approved Budget</th><th>Consultant</th><th>Median</th>{view.bidderColumns.map(item => <th key={item.id}>{item.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.workGroupId || row.disciplineCode}><td><strong>{row.title}</strong><small>{row.subtitle}</small></td><td>{row.budgetDisplay}</td><td>{row.consultantDisplay}</td><td>{row.medianDisplay}</td>{row.bidderCells.map(cell => <td key={cell.id} className={cell.tone}>{cell.primary}<small>{cell.secondary}</small></td>)}</tr>)}</tbody></table>;
}

function ItemTable({ view }) {
  return <table className="bidder-boq-table tender-comparison-table tender-comparison-matrix"><thead><tr><th>BOQ Item</th><th>Consultant Qty</th><th>Median Unit Rate</th>{view.bidderColumns.map(item => <th key={item.id}>{item.label}</th>)}</tr></thead><tbody>{view.itemRows.map(row => <tr key={row.lineId}><td><strong>{row.title}</strong><small>{row.subtitle}</small></td><td>{row.consultantDisplay}</td><td>{row.medianDisplay}<small>{row.medianDetail}</small></td>{row.bidderCells.map(cell => <td key={cell.id} className={cell.tone}><strong>{cell.primary}</strong><small>{cell.detail}</small><small>{cell.change}</small></td>)}</tr>)}</tbody></table>;
}
