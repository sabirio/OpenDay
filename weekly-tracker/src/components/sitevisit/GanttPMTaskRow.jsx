import AttentionSurface from '../shared/detail/AttentionSurface.jsx';
import { computeWPObservationDiscrepancy, progressGapPp } from '../../hooks/useDiscrepancyPresentation';
import { getDefaultProgressForGanttStatus } from '../../hooks/useProgressPresentation';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'blocked', label: 'Blocked' },
];

function GanttPMTaskRow({ task, pmEntry, onChange, focused = false }) {
  const gcStatus = task.status || 'not_started';
  const gcProgress = task.actual_progress ?? 0;
  const hasObservation = Boolean(
    pmEntry?.observed_status && Number.isFinite(Number(pmEntry.observed_progress)),
  );
  const pmStatus = hasObservation ? pmEntry.observed_status : gcStatus;
  const currentProgress = hasObservation ? Number(pmEntry.observed_progress) : gcProgress;
  const discrepancy = hasObservation
    ? computeWPObservationDiscrepancy({
        gc_progress: gcProgress,
        gc_status: gcStatus,
        observed_progress: currentProgress,
        observed_status: pmStatus,
      })
    : null;

  function handleStatusClick(statusValue) {
    const autoProgress = getDefaultProgressForGanttStatus(statusValue, currentProgress);
    onChange({ ...(pmEntry || {}), observed_progress: autoProgress, observed_status: statusValue });
  }

  return (
    <article
      data-testid="pm-task-row"
      data-wp-id={task.id}
      className={`site-visit-observation ${focused ? 'is-focused' : ''}`}
    >
      <section className="site-visit-reported" aria-labelledby={`reported-${task.id}`}>
        <div className="site-visit-concept-label">Reported by contractor</div>
        <h3 id={`reported-${task.id}`}>{gcStatus.replaceAll('_', ' ')} · {gcProgress}%</h3>
        <p>Current scoped schedule state used by the canonical discrepancy comparison.</p>
      </section>

      <section className="site-visit-observed" aria-labelledby={`observed-${task.id}`}>
        <div className="site-visit-concept-label">Observed by PM</div>
        <h3 id={`observed-${task.id}`}>{hasObservation ? `${pmStatus.replaceAll('_', ' ')} · ${currentProgress}%` : 'Not recorded yet'}</h3>
        <div className="site-visit-status-options" role="group" aria-label={`Observed status for ${task.label}`}>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-testid={`pm-status-btn-${option.value}`}
              aria-pressed={hasObservation && pmStatus === option.value}
              onClick={() => handleStatusClick(option.value)}
            >
              {option.label}
              {gcStatus === option.value && <span>Reported</span>}
            </button>
          ))}
        </div>

        {(pmStatus === 'in_progress' || pmStatus === 'delayed') && (
          <label className="site-visit-progress-control">
            <span>Observed progress</span>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={currentProgress}
              onChange={(event) => onChange({
                ...(pmEntry || {}),
                observed_progress: Number(event.target.value),
                observed_status: pmStatus,
              })}
            />
            <strong>{currentProgress}%</strong>
          </label>
        )}

        {hasObservation && (
          <label className="site-visit-note-control">
            <span>Observation note <small>Optional</small></span>
            <textarea
              rows={3}
              value={pmEntry?.pm_note || ''}
              onChange={(event) => onChange({ ...(pmEntry || {}), pm_note: event.target.value })}
              placeholder="Record what you observed for this work package."
            />
          </label>
        )}
      </section>

      {!hasObservation ? (
        <div className="site-visit-discrepancy-state is-pending" role="status">
          <strong>Discrepancy not evaluated</strong>
          <span>Record an observed status to compare reported and observed reality.</span>
        </div>
      ) : discrepancy.discStatus === 'ok' ? (
        <div className="site-visit-discrepancy-state is-aligned" role="status">
          <strong>No material discrepancy</strong>
          <span>Observed state is within the canonical comparison tolerance.</span>
        </div>
      ) : (
        <AttentionSurface
          title="Reported and observed states differ"
          description={currentProgress !== gcProgress
            ? `${progressGapPp(currentProgress, gcProgress)} percentage-point gap · ${discrepancy.discStatus}`
            : `Status mismatch · ${discrepancy.discStatus}`}
          className="site-visit-discrepancy-state"
          data-testid="pm-task-discrepancy"
        />
      )}
    </article>
  );
}

export default GanttPMTaskRow;
