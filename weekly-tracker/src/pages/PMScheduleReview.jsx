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
import { usePmBaselineApprovalSummary } from '../hooks/usePmBaselineApprovalSummary.js';
import { Button, Field, TEXTAREA_CLASS } from '../components/shared/UiPrimitives.jsx';
import { PageHeader, PageShell } from '../components/shared/LayoutPrimitives.jsx';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../components/shared/UiPatterns.jsx';

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
  return <ErrorState message={message || 'This project is unavailable or you do not have access.'}/>;
}

function ScheduleReviewUnavailableState({ project }) {
  return <EmptyState title="Schedule Review unavailable" body={`This project${project?.storeCode ? ` (${project.storeCode})` : ''} does not use Contractor-managed scheduling.`}/>;
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
      <div className="w-full max-w-md p-6">
        <h3 id="schedule-review-comment-title" className="text-lg font-bold text-ui-primary">{title}</h3>
        {confirmNote && <p className="mt-2 text-sm leading-5 text-ui-secondary">{confirmNote}</p>}
        <Field className="mt-4" label={`Comment${requireComment ? ' (required)' : ' (optional)'}`}>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className={TEXTAREA_CLASS}
        />
        </Field>
        <div className="mt-4 flex justify-end gap-3">
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
          >
            {submitting ? 'Working…' : confirmLabel}
          </Button>
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

  const { tasks: snapshotTasks, loading: snapshotLoading, error: snapshotError, completeness } = useScheduleVersionSnapshot({
    projectId, versionId: activeVersion?.id,
  });
  const approvalSummary = usePmBaselineApprovalSummary(activeVersion, snapshotTasks, completeness);

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

  if (!project && contextLoading) return <LoadingState label="Loading project…"/>;
  if (!project) return <ProjectNotFoundState message={contextError} />;
  if (!scheduleIsContractorManaged) return <ScheduleReviewUnavailableState project={project} />;

  const isPendingSelected = activeVersion?.status === 'PENDING_REVIEW';

  return (
    <PageShell width="content" inset="page">
      <PageHeader eyebrow={project.storeCode} title={project.shoppingMallName || 'Schedule Review'} description="Review the Contractor's immutable schedule submission and establish the approved baseline." context={`Opening ${fmtDate(project.targetOpeningDate)}`}/>
      <div className="flex flex-wrap gap-5 text-sm text-ui-secondary"><span>Construction Start: <strong className="text-ui-primary">{fmtDate(project.constructionStartDate)}</strong></span><span>Required Completion: <strong className="text-ui-primary">{fmtDate(project.constructionEndDate)}</strong></span></div>

      <main className="grid gap-4">
        {submissionLoading ? (
          <LoadingState label="Loading submissions…"/>
        ) : loadError ? (
          <ErrorState message="Could not load this project's schedule submissions. Please try again."/>
        ) : !activeVersion ? (
          <EmptyState title="No schedule submitted" body="No schedule has been submitted for this project yet."/>
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

            {snapshotError && (
              <InlineAlert>
                The immutable baseline snapshot could not be verified. Approval is disabled until it reloads successfully.
              </InlineAlert>
            )}

            {isPmRole && isPendingSelected && (
              <div className="flex justify-end gap-3">
                <Button
                  onClick={() => setModal('request-changes')}
                  disabled={actionPending || !approvalSummary.ready}
                >
                  Request Changes
                </Button>
                <Button variant="primary"
                  onClick={() => setModal('approve')}
                  disabled={actionPending}
                >
                  Approve
                </Button>
              </div>
            )}
            {!isPmRole && isPendingSelected && (
              <div className="text-right text-sm text-ui-muted">
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
          confirmNote={approvalSummary.isCanonical
            ? `Approve Baseline v${nextBaselineRevisionNumber}: Execution Scope #${approvalSummary.executionScopeVersionId}, ${approvalSummary.activityCount} Activities, ${approvalSummary.workGroupCount} Work Groups. This immutable snapshot becomes the official construction reference.`
            : `This legacy submission will become Approved Baseline v${nextBaselineRevisionNumber}. Contractor editing and Scope editing will remain locked until a future revision workflow is introduced.`}
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
    </PageShell>
  );
}

export default PMScheduleReview;
