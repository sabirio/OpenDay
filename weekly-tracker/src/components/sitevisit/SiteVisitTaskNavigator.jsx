import GanttPMTaskRow from './GanttPMTaskRow';

const FILTERS = ['all', 'incomplete', 'completed', 'discrepant'];

function taskState(task, observation) {
  if (!observation?.observed_status || !Number.isFinite(Number(observation.observed_progress))) {
    return { label: 'Not observed', tone: 'is-incomplete' };
  }
  const observed = `${observation.observed_status.replaceAll('_', ' ')} · ${Number(observation.observed_progress)}%`;
  return { label: observed, tone: 'is-complete' };
}

export default function SiteVisitTaskNavigator({
  tasks,
  allTasks,
  filter,
  counts,
  onFilter,
  navigation,
  onNavigate,
  pmWpObservations,
  updatePMObservation,
}) {
  const currentTask = navigation.task;

  return (
    <section className="site-visit-workspace" aria-labelledby="site-visit-scope-title">
      <aside className="site-visit-scope-pane">
        <div className="site-visit-scope-heading">
          <div>
            <h2 id="site-visit-scope-title">Verification scope</h2>
            <p>{counts.completedCount} verified · {counts.incompleteCount} untouched · {counts.discrepancyCount} discrepant</p>
          </div>
          <span aria-live="polite">{tasks.length} of {allTasks.length}</span>
        </div>

        <div className="site-visit-filters" role="group" aria-label="Observation filter">
          {FILTERS.map((value) => (
            <button type="button" key={value} aria-pressed={filter === value} onClick={() => onFilter(value)}>
              {value}
              <span>{value === 'all' ? counts.totalCount : value === 'incomplete' ? counts.incompleteCount : value === 'completed' ? counts.completedCount : counts.discrepancyCount}</span>
            </button>
          ))}
        </div>

        <div className="site-visit-task-list" aria-label="Work packages in current filter">
          {tasks.map((task) => {
            const state = taskState(task, pmWpObservations[task.id]);
            const selected = String(task.id) === String(currentTask?.id);
            return (
              <button
                type="button"
                key={task.id}
                className={`site-visit-master-row ${selected ? 'is-selected' : ''}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onNavigate(task.id)}
              >
                <strong>{task.label}</strong>
                <span>{task.phaseLabel || task.phaseId || 'Project scope'}</span>
                <small className={state.tone}>Reported {task.actual_progress ?? 0}% · {state.label}</small>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="site-visit-detail-pane">
        {currentTask ? (
          <>
            <header className="site-visit-current-heading">
              <div>
                <span>Current verification target</span>
                <h2>{currentTask.label}</h2>
                <p>{currentTask.phaseLabel || currentTask.phaseId || 'Project scope'}</p>
              </div>
              <strong>{navigation.index + 1} of {tasks.length}</strong>
            </header>
            <GanttPMTaskRow
              task={currentTask}
              pmEntry={pmWpObservations[currentTask.id]}
              onChange={(updates) => updatePMObservation(currentTask.id, updates)}
              focused
            />
          </>
        ) : (
          <div className="site-visit-filter-empty" role="status">
            <h2>No work packages match this filter</h2>
            <p>Your observations remain saved. Choose another filter to continue the visit.</p>
            <button type="button" className="btn btn-secondary" onClick={() => onFilter('all')}>Show all work packages</button>
          </div>
        )}
      </div>
    </section>
  );
}
