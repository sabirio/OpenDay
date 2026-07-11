import GanttPMTaskRow from './GanttPMTaskRow';
export default function SiteVisitTaskNavigator({ tasks, allTasks, navigation, filter, counts, onFilter, onNavigate, pmWpObservations, updatePMObservation }) {
  const { index, task, previousId, nextId } = navigation;
  return (
    <section className="site-visit-navigator" aria-labelledby="site-visit-scope-title">
      <div className="site-visit-nav-heading"><div><h2 id="site-visit-scope-title">Work package observations</h2><p>{counts.completedCount} checked · {counts.incompleteCount} incomplete · {counts.discrepancyCount} discrepant</p></div><span aria-live="polite">{task ? `${index + 1} of ${tasks.length}` : `0 of ${allTasks.length}`}</span></div>
      <div className="site-visit-filters" role="group" aria-label="Observation filter">{['all','incomplete','completed','discrepant'].map(value => <button type="button" key={value} aria-pressed={filter===value} onClick={()=>onFilter(value)}>{value}</button>)}</div>
      {task ? <div className="site-visit-current-item"><div className="site-visit-group-label">{task.phaseLabel || task.phaseId || 'Project scope'}</div><GanttPMTaskRow task={task} pmEntry={pmWpObservations[task.id]} onChange={updates=>updatePMObservation(task.id,updates)} /></div> : <div className="empty-state">No observations match this filter. Your data is still saved; choose another filter.</div>}
      <div className="site-visit-nav-actions"><button type="button" disabled={!previousId} onClick={()=>onNavigate(previousId)}>Previous</button><button type="button" disabled={!nextId} onClick={()=>onNavigate(nextId)}>Next</button></div>
    </section>
  );
}
