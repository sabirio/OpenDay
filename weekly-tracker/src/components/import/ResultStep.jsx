import { Link } from 'react-router-dom';
import { describeCommitOutcome } from '../../hooks/import/useImportWorkflow.js';

export default function ResultStep({ result, resultSummary, onImportAnother, onBackToPortfolio }) {
  const notImportedRows = result.rows.filter(row => row.outcome !== 'COMMITTED' && row.outcome !== 'SKIPPED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card import-result-hero">
        <h2>Import complete</h2>
        <div className="import-result-counts">
          <div><span className="value">{resultSummary.imported}</span><span className="label">Imported</span></div>
          {resultSummary.conflict > 0 ? <div><span className="value">{resultSummary.conflict}</span><span className="label">Conflict</span></div> : null}
          {resultSummary.skipped > 0 ? <div><span className="value">{resultSummary.skipped}</span><span className="label">Skipped</span></div> : null}
          {resultSummary.notImported > 0 ? <div><span className="value">{resultSummary.notImported}</span><span className="label">Not imported</span></div> : null}
        </div>
      </div>

      {notImportedRows.length > 0 ? (
        <div className="card ds-data-surface" style={{ padding: 0 }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th scope="col">Store Code</th>
                <th scope="col">Outcome</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {notImportedRows.map(row => {
                const status = describeCommitOutcome(row.outcome);
                return (
                  <tr key={row.sourceRow}>
                    <td>{row.storeCode || '—'}</td>
                    <td><span className={`import-row-status import-row-status--${status.tone}`}>{status.label}</span></td>
                    <td>{row.reason || (row.outcome === 'BLOCKED_IN_PLAN' ? 'Blocked during review — see the mapping/preview step for details.' : '—')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <Link to="/projects" className="btn btn-ghost" onClick={onBackToPortfolio}>Back to Portfolio</Link>
        <button type="button" className="btn btn-primary" onClick={onImportAnother}>Import another file</button>
      </div>
    </div>
  );
}
