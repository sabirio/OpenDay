import Icon from '../shared/Icon';
import StatusBadge from '../shared/StatusBadge.jsx';

const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'missing', label: 'Missing' },
  { id: 'submitted', label: 'Submitted' },
];

export default function WeeklyReportsMasterList({
  projects,
  rows,
  filteredRows,
  selectedKey,
  selectedProjectId,
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  onProjectChange,
  onSelect,
}) {
  const counts = {
    all: rows.length,
    missing: rows.filter((row) => row.status === 'missing').length,
    submitted: rows.filter((row) => row.status === 'submitted').length,
  };

  return (
    <>
      <div className="master-pane-header">
        <h1 className="master-pane-title">Weekly Reports</h1>
        <label className="master-search">
          <span className="sr-only">Search projects or reports</span>
          <Icon name="search" size={15} />
          <input
            className="ds-input"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search projects or reports..."
          />
        </label>
        <div className="master-filter-row" aria-label="Weekly report filters">
          <label className="master-filter-select-wrap">
            <span className="sr-only">Jump to project</span>
            <select
              data-testid="project-select"
              className="ds-select master-filter-select weekly-master-project-select"
              value={selectedProjectId}
              onChange={onProjectChange}
              aria-label="Jump to project"
            >
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.storeCode} - {project.shoppingMallName}
                </option>
              ))}
            </select>
          </label>
          <div className="master-quick-filters" role="group" aria-label="Quick weekly report filters">
            {QUICK_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={filterStatus === id ? 'master-quick-filter is-active' : 'master-quick-filter'}
                aria-pressed={filterStatus === id}
                onClick={() => onFilterChange(id)}
              >
                {label} <span>{counts[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="master-pane-list" data-testid="weekly-master-list">
        <div className="master-list-label">
          <span>{filterStatus === 'all' && !searchQuery ? 'Reporting contexts' : 'Filtered reports'}</span>
          <span>{filteredRows.length}</span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="master-list-empty">
            {rows.length === 0 ? "No projects yet. Add a project to begin." : "No weekly reports match the current search and filter."}
          </div>
        ) : filteredRows.map((row) => {
          const selected = selectedKey === row.key;
          return (
            <button
              key={row.key}
              type="button"
              className={selected ? 'master-list-row weekly-master-row is-selected' : 'master-list-row weekly-master-row'}
              aria-pressed={selected}
              onClick={() => onSelect(row)}
              data-testid="weekly-master-report"
              data-project-id={row.projectId}
              data-report-id={row.reportId}
            >
              <span className="master-row-top">
                <strong title={row.projectCode || undefined}>{row.projectCode || 'Project code not set'}</strong>
                <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
              </span>
              <span className="master-row-name" title={row.projectName || undefined}>
                {row.projectName || 'Project name not set'}
              </span>
              <span className="master-row-bottom weekly-master-context">
                <span title={row.reportingContext}>{row.reportingContext}</span>
                {row.attentionLabel && <span className="weekly-master-attention">{row.attentionLabel}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
