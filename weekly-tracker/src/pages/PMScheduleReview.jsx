import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/rolePermissions';
import { isContractorManaged } from '../hooks/useScheduleOwnershipMode';
import { useToast } from '../components/shared/Toast.jsx';
import { useScheduleSubmission } from '../hooks/useScheduleSubmission';
import { useScheduleVersionSnapshot } from '../hooks/useScheduleVersionSnapshot';
import { loadContractorScheduleProjectFallback } from '../hooks/useContractorScheduleOrchestration';
import Modal from '../components/shared/Modal.jsx';
import SubmissionSnapshotView from '../components/schedule/SubmissionSnapshotView.jsx';
import { fmtDate } from '../components/schedule/scheduleSubmissionDisplay.js';
import SubmissionHistoryList from '../components/schedule/SubmissionHistoryList.jsx';

// Simplification Phase 4B.2 — PM Schedule Review workspace.
//
// A Layout-wrapped route (/projects/:projectId/schedule-review), same
// pattern as /projects/:projectId/snags and /projects/:projectId/plans —
// this is an office/PM-facing surface, not a field-worker standalone shell.
//
// Three independent layers of enforcement, same posture as
// ContractorSchedule.jsx: (1) ProtectedRoute's resource="schedule_review"
// (rolePermissions.js — PM and Admin's 'all' wildcard only, Contractor and
// Viewer excluded); (2) this page's own role check, hiding Approve/Request
// Changes controls from anyone but PM (Admin reaches the route for
// read-only oversight but never receives decision controls, same precedent
// as Admin on the Contractor Schedule route); (3) the RPCs themselves
// (request_schedule_changes/approve_schedule_submission, both explicit
// role='pm' checks, ANDing can_write_project() for company-scoping) are the
// final authority regardless of what this page renders or hides.
function ProjectNotFoundState({ message }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Project not found</h2>
      <p style={{ color: 'var(--text-secondary)' }}>{message || 'This project is unavailable or you do not have access.'}</p>
    </div>
  );
}

function ScheduleReviewUnavailableState({ project }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Schedule Review unavailable</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        This project{project?.storeCode ? ` (${project.storeCode})` : ''} does not use Contractor-managed scheduling.
      </p>
    </div>
  );
}

function CommentModal({ title, requireComment, onConfirm, onClose, confirmLabel, confirmNote }) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canConfirm = !requireComment || comment.trim().length > 0;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(comment.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} titleId="schedule-review-comment-title">
      <div style={{ padding: 24, minWidth: 380, maxWidth: 480 }}>
        <h3 id="schedule-review-comment-title" style={{ color: 'var(--text-primary)', marginTop: 0 }}>{title}</h3>
        {confirmNote && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{confirmNote}</p>}
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Comment{requireComment ? ' (required)' : ' (optional)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', padding: 10, fontSize: 14, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: (!canConfirm || submitting) ? 'var(--bg-elevated)' : 'var(--accent)',
              color: (!canConfirm || submitting) ? 'var(--text-muted)' : 'var(--text-inverse)',
              fontWeight: 700, cursor: (!canConfirm || submitting) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PMScheduleReview({ projects = [] }) {
  const { projectId } = useParams();
  const { role } = useAuth();
  const toast = useToast();

  const [fallbackProject, setFallbackProject] = useState(null);
  const [contextLoading, setContextLoading] = useState(() => !projects.some((p) => String(p.id) === projectId));
  const [contextError, setContextError] = useState(null);
  const project = projects.find((p) => String(p.id) === projectId) || fallbackProject;

  useEffect(() => {
    const hasProject = projects.some((p) => String(p.id) === projectId);
    if (hasProject) return;
    let isMounted = true;
    loadContractorScheduleProjectFallback(projectId, { hasProject })
      .then((loaded) => { if (isMounted) setFallbackProject(loaded); })
      .catch((error) => { if (isMounted) setContextError(error?.message || 'Failed to load project'); })
      .finally(() => { if (isMounted) setContextLoading(false); });
    return () => { isMounted = false; };
  }, [projectId, projects]);

  const scheduleIsContractorManaged = isContractorManaged(project?.scheduleOwnershipMode);
  const isPmRole = role === ROLES.PM;

  const {
    loading: submissionLoading, loadError, versions, pendingVersion, latestVersion,
    requestChanges, approve, actionPending, nextBaselineRevisionNumber,
  } = useScheduleSubmission({ projectId: scheduleIsContractorManaged ? projectId : null });

  // Default to the pending submission when one exists (the PM's actual
  // work queue); otherwise fall back to the most recent decided one, so a
  // PM/Admin can still review history even with nothing currently pending.
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const activeVersion = versions.find((v) => String(v.id) === String(selectedVersionId))
    || pendingVersion
    || latestVersion;

  // Pin the default selection once it first becomes available — a pure,
  // synchronous derived-state sync (not I/O), so it's adjusted directly
  // during render (React's own recommended pattern for this shape) rather
  // than through a useEffect. Guarded by !selectedVersionId, so it only
  // ever fires once: after this sets it, the condition is false on every
  // later render, whether the value changes or not.
  if (!selectedVersionId && activeVersion) {
    setSelectedVersionId(activeVersion.id);
  }

  const { tasks: snapshotTasks, loading: snapshotLoading, completeness } = useScheduleVersionSnapshot({
    projectId, versionId: activeVersion?.id,
  });

  const [modal, setModal] = useState(null); // null | 'approve' | 'request-changes'

  const handleApprove = useCallback(async (comment) => {
    const outcome = await approve(activeVersion.id, comment);
    setModal(null);
    if (outcome.ok) toast.success('Submission approved as the baseline.');
    else toast.error(outcome.error.message);
  }, [approve, activeVersion, toast]);

  const handleRequestChanges = useCallback(async (comment) => {
    const outcome = await requestChanges(activeVersion.id, comment);
    setModal(null);
    if (outcome.ok) toast.success('Changes requested — the Contractor can now edit and resubmit.');
    else toast.error(outcome.error.message);
  }, [requestChanges, activeVersion, toast]);

  if (!project && contextLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;
  if (!project) return <ProjectNotFoundState message={contextError} />;
  if (!scheduleIsContractorManaged) return <ScheduleReviewUnavailableState project={project} />;

  const isPendingSelected = activeVersion?.status === 'PENDING_REVIEW';

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.02em' }}>{project.storeCode}</div>
        <h1 style={{ color: 'var(--text-primary)', margin: '2px 0 10px', fontSize: 22 }}>{project.shoppingMallName || 'Schedule Review'}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>Construction Start: <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(project.constructionStartDate)}</strong></span>
          <span>Required Completion: <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(project.constructionEndDate)}</strong></span>
          <span>Opening: <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(project.targetOpeningDate)}</strong></span>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {submissionLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading submissions…</div>
        ) : loadError ? (
          <div role="alert" style={{ padding: 24, textAlign: 'center', color: 'var(--status-alert)' }}>
            Could not load this project's schedule submissions. Please try again.
          </div>
        ) : !activeVersion ? (
          <div role="status" style={{ padding: 40, textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-secondary)' }}>
            No schedule has been submitted for this project yet.
          </div>
        ) : (
          <>
            <SubmissionSnapshotView
              project={project}
              version={activeVersion}
              tasks={snapshotTasks}
              loading={snapshotLoading}
              contractorEmail={project.contractorEmail}
              completeness={completeness}
            />

            {isPmRole && isPendingSelected && (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setModal('request-changes')}
                  disabled={actionPending}
                  style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, cursor: actionPending ? 'not-allowed' : 'pointer' }}
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  onClick={() => setModal('approve')}
                  disabled={actionPending}
                  style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--text-inverse)', fontWeight: 700, cursor: actionPending ? 'not-allowed' : 'pointer' }}
                >
                  Approve
                </button>
              </div>
            )}
            {!isPmRole && isPendingSelected && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
                Read-only oversight — only the assigned PM can decide.
              </div>
            )}

            <SubmissionHistoryList versions={versions} selectedVersionId={activeVersion.id} onSelect={setSelectedVersionId} />
          </>
        )}
      </main>

      {modal === 'approve' && (
        <CommentModal
          title="Approve this submission as the baseline?"
          confirmNote={`This submission will become Approved Baseline v${nextBaselineRevisionNumber}. Contractor editing and Scope editing will remain locked until a future revision workflow is introduced.`}
          requireComment={false}
          confirmLabel="Approve"
          onConfirm={handleApprove}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'request-changes' && (
        <CommentModal
          title="Request changes to this submission?"
          confirmNote="The Contractor will see your comment and be able to edit and resubmit. The current submission remains visible in history, unchanged."
          requireComment
          confirmLabel="Request Changes"
          onConfirm={handleRequestChanges}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default PMScheduleReview;
