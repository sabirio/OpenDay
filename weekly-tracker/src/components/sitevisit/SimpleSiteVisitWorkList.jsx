import { getDefaultProgressForGanttStatus } from '../../hooks/useProgressPresentation';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'blocked', label: 'Blocked' },
];

function SimpleTaskRow({ task, contractorEntry, observation, onChange }) {
  const contractorStatus = contractorEntry?.status || null;
  const contractorProgress = contractorEntry?.progress_pct ?? 0;
  const observedStatus = observation?.observed_status || '';

  function selectStatus(status) {
    onChange({
      ...(observation || {}),
      observed_status: status,
      observed_progress: getDefaultProgressForGanttStatus(status, contractorProgress),
    });
  }

  return (
    <div className="site-visit-simple-task" data-testid="pm-task-row" data-wp-id={task.id}>
      <div className="site-visit-simple-task-name">
        <strong>{task.label || task.id}</strong>
        <span>{contractorStatus ? `Contractor reported: ${contractorStatus.replaceAll('_', ' ')}${contractorStatus === 'in_progress' ? ` · ${contractorProgress}%` : ''}` : 'Not included in the latest contractor report'}</span>
      </div>
      <div className="site-visit-simple-statuses" role="group" aria-label={`Observed status for ${task.label || task.id}`}>
        {STATUS_OPTIONS.map(option => {
          const selected = observedStatus === option.value;
          const reported = contractorStatus === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={`pm-status-btn-${option.value}`}
              aria-pressed={selected}
              className={`${selected ? 'is-selected' : ''} ${reported ? 'is-contractor' : ''}`}
              onClick={() => selectStatus(option.value)}
            >
              {option.label}
              {reported && <span>Contractor</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SimpleSiteVisitWorkList({ tasks, contractorReport, observations, onChange }) {
  const contractorEntries = new Map((contractorReport?.wps || []).map(item => [item.wpId, item]));
  const groups = [];
  for (const task of tasks) {
    const groupName = task.phaseLabel || task.phaseId || 'Project works';
    let group = groups.find(item => item.name === groupName);
    if (!group) {
      group = { name: groupName, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  }

  return (
    <section className="site-visit-simple-list" aria-labelledby="site-visit-work-list-title">
      <div className="site-visit-simple-list-heading">
        <div>
          <h2 id="site-visit-work-list-title">Works from the latest contractor report</h2>
          <p>The contractor's reported status is marked on each row. Select only what you verified during this visit.</p>
        </div>
      </div>
      {groups.map(group => (
        <div className="site-visit-simple-group" key={group.name}>
          <h3>{group.name}</h3>
          {group.tasks.map(task => (
            <SimpleTaskRow key={task.id} task={task} contractorEntry={contractorEntries.get(task.id)} observation={observations[task.id]} onChange={updates => onChange(task.id, updates)} />
          ))}
        </div>
      ))}
    </section>
  );
}
