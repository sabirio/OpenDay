import Icon from '../shared/Icon';
import StatusBadge from '../shared/StatusBadge.jsx';
import { riskLevelToTone } from '../../config/statusColors';

const LEVEL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'CRITICAL', label: 'Critical' },
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
];

export default function RiskDashboardMasterList({
  rows,
  filteredRows,
  selectedRiskProjectId,
  searchQuery,
  onSearchChange,
  levelFilter,
  onLevelFilterChange,
  onSelect,
  useSCurve,
  onForecastModelChange,
  summaryStats,
}) {
  const counts = Object.fromEntries(LEVEL_FILTERS.map(({ id }) => [
    id,
    id === 'all' ? rows.length : rows.filter((row) => row.riskScore.level === id).length,
  ]));

  return (
    <>
      <div className="master-pane-header risk-master-header">
        <h1 className="master-pane-title">Risks</h1>
        <label className="master-search">
          <span className="sr-only">Search project or risk</span>
          <Icon name="search" size={15} />
          <input
            className="ds-input"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search project or risk..."
          />
        </label>

        <div className="master-quick-filters risk-master-filters" role="group" aria-label="Risk severity filters">
          {LEVEL_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={levelFilter === id ? 'master-quick-filter is-active' : 'master-quick-filter'}
              aria-pressed={levelFilter === id}
              onClick={() => onLevelFilterChange(id)}
            >
              {label} <span>{counts[id]}</span>
            </button>
          ))}
        </div>

      </div>

      <div className="risk-master-list-tools">
        <div className="risk-forecast-control" role="group" aria-label="Global forecast model">
          <span>Forecast</span>
          <button type="button" aria-pressed={!useSCurve} onClick={() => onForecastModelChange(false)}>Linear</button>
          <button type="button" aria-pressed={useSCurve} onClick={() => onForecastModelChange(true)}>S-curve</button>
        </div>
      </div>

      <div className="master-pane-list" data-testid="risk-master-list">
        <div className="master-list-label">
          <span>Priority queue</span>
          <span>{filteredRows.length}</span>
        </div>

        <button
          type="button"
          className={selectedRiskProjectId === null ? 'master-list-row risk-master-row risk-portfolio-row is-selected' : 'master-list-row risk-master-row risk-portfolio-row'}
          aria-pressed={selectedRiskProjectId === null}
          onClick={() => onSelect(null)}
          data-testid="risk-master-portfolio"
        >
          <span className="master-row-top">
            <strong>All Risks</strong>
            <StatusBadge tone="danger">{summaryStats.CRITICAL} CRITICAL</StatusBadge>
          </span>
          <span className="master-row-name">Portfolio risk overview</span>
          <span className="master-row-bottom">
            <span>{summaryStats.HIGH} high · {summaryStats.MEDIUM} medium · Avg score {summaryStats.avgScore}</span>
          </span>
        </button>

        {filteredRows.length === 0 ? (
          <div className="master-list-empty">
            {rows.length === 0 ? "No projects yet. Add a project to begin." : "No projects match the current search and severity filter."}
          </div>
        ) : filteredRows.map((row) => {
          const selected = selectedRiskProjectId === String(row.project.id);
          const delay = row.schedDev?.predictedDelayDays;
          return (
            <button
              key={row.project.id}
              type="button"
              className={selected ? 'master-list-row risk-master-row is-selected' : 'master-list-row risk-master-row'}
              aria-pressed={selected}
              onClick={() => onSelect(String(row.project.id))}
              data-testid="risk-master-project"
              data-project-id={row.project.id}
            >
              <span className="master-row-top">
                <strong title={row.project.storeCode || undefined}>{row.project.storeCode || 'Project code not set'}</strong>
                <StatusBadge tone={riskLevelToTone(row.riskScore.level)}>{row.riskScore.level}</StatusBadge>
              </span>
              <span className="master-row-name" title={row.project.shoppingMallName || undefined}>
                {row.project.shoppingMallName || 'Project name not set'}
              </span>
              <span className="master-row-bottom">
                <span>{delay > 0 ? `+${delay} days` : 'On track'} · Risk Score {row.riskScore.score}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
