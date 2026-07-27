import SiteVisitPhaseSection from './SiteVisitPhaseSection';

function groupLabelFor(task) {
  return task.phaseLabel || task.phaseId || 'Project scope';
}

// Groups a task list by phase, preserving first-seen order — same grouping
// key/fallback WorkPackageProgressSection.jsx (Contractor Report) already
// uses for its own phase sections.
function groupByPhase(taskList) {
  const byPhase = new Map();
  for (const task of taskList) {
    const key = groupLabelFor(task);
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key).push(task);
  }
  return byPhase;
}

// Renders every filtered in-scope task as a continuous scrollable list of
// collapsible phase sections instead of one item behind Previous/Next
// paging. Each row still requires its own explicit status click
// (GanttPMTaskRow is unchanged) — this only removes the per-task
// "advance to next" tax that paging added on top of that click, and groups
// tasks the way SiteVisitPhaseSection needs (phase % + auto-collapse).
export default function SiteVisitTaskNavigator({ tasks, allTasks, filter, counts, onFilter, pmWpObservations, updatePMObservation, projectId }) {
  const allByPhase = groupByPhase(allTasks);
  const filteredByPhase = groupByPhase(tasks);

  return (
    <section className="site-visit-navigator" aria-labelledby="site-visit-scope-title">
      <div className="site-visit-nav-heading">
        <div>
          <h2 id="site-visit-scope-title">Work package observations</h2>
          <p>{counts.completedCount} checked · {counts.incompleteCount} incomplete · {counts.discrepancyCount} discrepant</p>
        </div>
        <span aria-live="polite">{tasks.length} of {allTasks.length} shown</span>
      </div>
      <div className="site-visit-filters" role="group" aria-label="Observation filter">
        {['all', 'incomplete', 'completed', 'discrepant'].map(value => (
          <button type="button" key={value} aria-pressed={filter === value} onClick={() => onFilter(value)}>{value}</button>
        ))}
      </div>
      {tasks.length === 0 ? (
        <div className="empty-state">No observations match this filter. Your data is still saved; choose another filter.</div>
      ) : (
        <div className="site-visit-task-list">
          {[...allByPhase.keys()].filter(phaseKey => filteredByPhase.has(phaseKey)).map(phaseKey => (
            <SiteVisitPhaseSection
              key={phaseKey}
              phaseKey={phaseKey}
              tasks={filteredByPhase.get(phaseKey)}
              allPhaseTasks={allByPhase.get(phaseKey)}
              pmWpObservations={pmWpObservations}
              updatePMObservation={updatePMObservation}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
