import React from 'react';
import { fmtDateTime, STATUS_LABEL } from './scheduleSubmissionDisplay.js';

const GanttChart = React.lazy(() => import('../GanttChart.jsx'));

/**
 * Read-only view of ONE immutable submission (Simplification Phase 4B.2
 * Section G): metadata header + GanttChart in strictly non-editable mode.
 * Reused by the Contractor's own "what I submitted" view, the PM Review
 * main panel, and submission history selection — one component, one shape,
 * so a moving Draft can never be mistaken for a frozen submission.
 *
 * `version` and `tasks` must both already be loaded by the caller (see
 * useScheduleSubmission / useScheduleVersionSnapshot) — this component does
 * no data fetching itself. `completeness` must be computed by the caller
 * via core/schedule/contractorScheduleLifecycle.js's
 * deriveScheduleCompleteness(tasks) — this component never re-derives it
 * (architecture guard: formulas live in engines/, never in components/).
 */
export default function SubmissionSnapshotView({ project, version, tasks, loading, contractorEmail, completeness }) {
  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
        Loading submission…
      </div>
    );
  }
  if (!version) return null;

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Submission #{version.submissionNumber}{version.status === 'APPROVED' && version.baselineRevisionNumber ? ` · Approved Baseline v${version.baselineRevisionNumber}` : ''}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
            {STATUS_LABEL[version.status] || version.status}
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <div>Submitted by: <strong style={{ color: 'var(--text-primary)' }}>{contractorEmail || 'Contractor'}</strong></div>
          <div>Submitted at: <strong style={{ color: 'var(--text-primary)' }}>{fmtDateTime(version.submittedAt)}</strong></div>
        </div>
        {version.reviewedAt && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <div>Reviewed at: <strong style={{ color: 'var(--text-primary)' }}>{fmtDateTime(version.reviewedAt)}</strong></div>
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Scheduled {version.executionScopeVersionId ? 'Activities' : 'WPs'}: <strong style={{ color: 'var(--text-primary)' }}>{completeness?.scheduledCount ?? 0} / {completeness?.totalCount ?? tasks.length}</strong>
        </div>
        {version.executionScopeVersionId && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Execution Scope snapshot: <strong style={{ color: 'var(--text-primary)' }}>#{version.executionScopeVersionId}</strong>
          </div>
        )}
      </div>

      {version.contractorComment && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Contractor comment</div>
          <div style={{ color: 'var(--text-primary)' }}>{version.contractorComment}</div>
        </div>
      )}
      {version.pmComment && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, background: 'var(--accent-subtle)' }}>
          <div style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>PM comment</div>
          <div style={{ color: 'var(--text-primary)' }}>{version.pmComment}</div>
        </div>
      )}

      <div style={{ padding: 8 }}>
        <React.Suspense fallback={<div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading schedule…</div>}>
          <GanttChart
            project={project}
            tasks={tasks}
            keyDates={{
              constructionStartDate: project?.constructionStartDate,
              constructionEndDate: project?.constructionEndDate,
              targetOpeningDate: project?.targetOpeningDate,
            }}
            readOnly
          />
        </React.Suspense>
      </div>
    </div>
  );
}
