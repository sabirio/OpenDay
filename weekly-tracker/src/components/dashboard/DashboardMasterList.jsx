import Icon from '../shared/Icon';
import { SCHEDULE_STATUS } from '../../utils/reportUtils';
import StatusBadge from '../shared/StatusBadge.jsx';

const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'at-risk', label: 'At Risk' },
];

const ADVANCED_FILTERS = [
  { id: 'all', label: 'Filters' },
  { id: 'on-track', label: 'On Track' },
  { id: 'at-risk', label: 'At Risk' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'critical', label: 'Critical' },
  { id: 'no-report', label: 'No Report' },
  { id: 'missing', label: 'Missing / Overdue' },
];

function lifecycleCount(rows, status) {
  return rows.filter(({ project }) => project.projectStatus === status).length;
}

function projectHealth(row) {
  if (row.latestReport?.projectScheduleStatus) return row.latestReport.projectScheduleStatus;
  return row.missingReport ? 'Missing report' : 'No report';
}

function healthTone(row) {
  const status = row.latestReport?.projectScheduleStatus;
  if (status === SCHEDULE_STATUS.ON_TRACK) return 'is-positive';
  if (status === SCHEDULE_STATUS.CRITICAL) return 'is-critical';
  if (status === SCHEDULE_STATUS.AT_RISK || status === SCHEDULE_STATUS.DELAYED || row.missingReport) return 'is-warning';
  return '';
}

export default function DashboardMasterList({
  rows,
  filteredRows,
  selectedProjectId,
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  onSelectPortfolio,
  onSelectProject,
}) {
  const activeCount = lifecycleCount(rows, 'Active');
  const completedCount = lifecycleCount(rows, 'Completed');
  const filterCount = filterStatus === 'all' ? 0 : 1;
  const quickCounts = {
    all: rows.length,
    active: activeCount,
    completed: completedCount,
    'at-risk': rows.filter(({ latestReport }) => latestReport?.projectScheduleStatus === SCHEDULE_STATUS.AT_RISK).length,
  };

  return (
    <>
      <div className="master-pane-header">
        <h2 className="master-pane-title">Projects</h2>
        <label className="master-search">
          <span className="sr-only">Search projects</span>
          <Icon name="search" size={15} />
          <input
            className="ds-input"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search projects..."
          />
        </label>
        <div className="master-filter-row" aria-label="Project filters">
          <label className="master-filter-select-wrap">
            <span className="sr-only">Additional project filters</span>
            <select
              className="ds-select master-filter-select"
              value={filterStatus}
              onChange={(event) => onFilterChange(event.target.value)}
              aria-label={`Additional project filters${filterCount ? `, ${filterCount} active` : ''}`}
            >
              {ADVANCED_FILTERS.map(({ id, label }) => (
                <option key={id} value={id}>{id === 'all' ? `${label}${filterCount ? ` ${filterCount}` : ''}` : label}</option>
              ))}
            </select>
          </label>
          <div className="master-quick-filters" role="group" aria-label="Quick project filters">
            {QUICK_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={filterStatus === id ? 'master-quick-filter is-active' : 'master-quick-filter'}
                aria-pressed={filterStatus === id}
                onClick={() => onFilterChange(id)}
              >
                {label} <span>{quickCounts[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="master-pane-list" data-testid="dashboard-master-list">
        <button
          type="button"
          className={selectedProjectId === null ? 'master-list-row master-list-row--portfolio is-selected' : 'master-list-row master-list-row--portfolio'}
          aria-pressed={selectedProjectId === null}
          onClick={onSelectPortfolio}
        >
          <span className="master-row-main">
            <strong>All Projects</strong>
            <span>Portfolio overview</span>
          </span>
          <span className="master-row-count">{rows.length}</span>
        </button>

        <div className="master-list-label">
          <span>{filteredRows.length === rows.length ? 'All projects' : 'Filtered projects'}</span>
          <span>{filteredRows.length}</span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="master-list-empty">No projects match the current search and filter.</div>
        ) : filteredRows.map((row) => {
          const { project, progress } = row;
          const id = String(project.id);
          const selected = selectedProjectId === id;
          const location = [project.city, project.country].filter(Boolean).join(', ') || 'Location not set';
          return (
            <button
              key={id}
              type="button"
              className={selected ? 'master-list-row is-selected' : 'master-list-row'}
              aria-pressed={selected}
              onClick={() => onSelectProject(id)}
              data-testid="dashboard-master-project"
              data-project-id={id}
            >
              <span className="master-row-top">
                <strong title={project.storeCode || undefined}>{project.storeCode || 'Project code not set'}</strong>
                <StatusBadge tone="neutral">{project.projectStatus || 'Status not set'}</StatusBadge>
              </span>
              <span className="master-row-name" title={project.shoppingMallName || undefined}>
                {project.shoppingMallName || 'Project name not set'}
              </span>
              <span className="master-row-bottom">
                <span title={location}>{location}</span>
                <span className={`master-health ${healthTone(row)}`.trim()}>{progress}% · {projectHealth(row)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
