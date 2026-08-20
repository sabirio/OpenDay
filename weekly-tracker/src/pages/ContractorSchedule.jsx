import React, { useCallback, useEffect, useState } from "react";
import {
  FIELD_TEXTAREA_CLASS,
  FieldAlert,
  FieldButton,
  FieldContainer,
  FieldLoading,
  FieldModalContent,
  FieldPage,
  FieldPageHeader,
  FieldPanel,
  FieldState,
  FieldStatus,
  FieldStickyActions,
} from "../components/shared/FieldPrimitives.jsx";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES } from "../auth/rolePermissions";
import { isContractorManaged } from "../hooks/useScheduleOwnershipMode";
import { useToast } from "../components/shared/Toast.jsx";
import { loadContractorScheduleProjectFallback } from "../hooks/useContractorScheduleOrchestration";
import { useContractorScheduleDraft } from "../hooks/useContractorScheduleDraft";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { useScheduleSubmission } from "../hooks/useScheduleSubmission";
import { useScheduleVersionSnapshot } from "../hooks/useScheduleVersionSnapshot";
import Modal from "../components/shared/Modal.jsx";
import SubmissionSnapshotView from "../components/schedule/SubmissionSnapshotView.jsx";
import SubmissionHistoryList from "../components/schedule/SubmissionHistoryList.jsx";
import ContractorScheduleSetupEditor from "../components/schedule/ContractorScheduleSetupEditor.jsx";
import { useContractorScheduleSetup } from "../hooks/useContractorScheduleSetup.js";
import { LoadingReportState, ProjectNotFoundState } from "../components/contractor/ContractorReportStates.jsx";

const GanttChart = React.lazy(() => import("../components/GanttChart"));

// Simplification Phase 3C / 3C.1 / 3C.2 — Contractor Schedule Workspace.
//
// Navigation (Phase 3C.2): this page has three real cross-navigation
// controls in its header — Workspace (imperative navigate(), via
// guardedNavigate), Report and Observations (real <Link>s, via
// guardLinkClick passed as their onClick). All three, plus browser Back/
// Forward and beforeunload, route through the ONE canonical
// useUnsavedChangesGuard — see that hook's own header for the full
// contract. These links did not exist before 3C.2; they were added
// specifically so ordinary React Router navigation has a real,
// user-visible surface to guard (this route has never been Layout-wrapped,
// so there is no app-shell Sidebar navigation to intercept here).
//
// Draft editing only: Scope exists before Schedule, Contractor owns
// execution planning, OpenDay structures and controls but never invents
// Contractor dates. No Submit, no PM Approval, no Baseline in this slice.
//
// Read model: useContractorScheduleDraft (Phase 3B/3B.1) is the ONE
// Contractor Draft view model — it already merges persisted
// project_gantt_tasks rows with locally-staged edits into one effective
// `tasks` array, so this page never merges the two ad hoc in JSX.
//
// Authorization (Phase 3C.1 — Contractor Draft Ownership): ProtectedRoute
// (App.jsx) only gates the 'contractor_schedule' role-level resource, which
// as of this phase no longer includes PM (see rolePermissions.js) — the
// Contractor Proposed Schedule / Draft belongs to the Contractor; PM
// review/approval is a distinct, not-yet-built workflow. Per-project access
// is enforced the same way ContractorReport.jsx already does — `projects`
// is pre-scoped by RLS (can_access_project()), so an unauthorized/
// nonexistent project id simply never appears there or in getProjectById's
// fallback fetch, and both cases converge on the same generic
// ProjectNotFoundState (no existence leak). isContractorManaged(project.
// scheduleOwnershipMode) (the canonical helper, never a scattered string
// literal) is this page's second check. isContractorRole below is a THIRD,
// independent check — Admin still reaches this route via its existing
// global 'all' permission (unchanged, pre-existing precedent: Admin can
// already open /contractor-report the same way, for read-only oversight —
// see ContractorSelect.jsx) but must never receive editable Draft controls,
// so any non-Contractor session (PM, Admin, Viewer) renders the same
// ScheduleUnavailableState an AUTO_GENERATED project would, never the
// editable Gantt. The final authority is still save_contractor_schedule_draft
// itself (048_contractor_schedule_ownership_enforcement.sql), which
// independently re-verifies role=contractor AND assigned_projects AND
// CONTRACTOR_MANAGED server-side regardless of what this page renders.

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ScheduleUnavailableState({ project, reason }) {
  const message = reason === "role"
    ? "Contractor Schedule editing is limited to the assigned Contractor."
    : `Contractor Schedule unavailable for this project${project?.storeCode ? ` (${project.storeCode})` : ""}.`;
  return (
    <FieldState title="Contractor Schedule unavailable" body={message}/>
  );
}

function DraftStatusLabel({ dirty, saving, saveError }) {
  const { text, tone } = saving
    ? { text: "Saving…", tone: "neutral" }
    : saveError
      ? { text: "Save failed", tone: "danger" }
      : dirty
        ? { text: "Unsaved changes", tone: "warning" }
        : { text: "Saved", tone: "positive" };
  return <FieldStatus tone={tone}>{text}</FieldStatus>;
}

// Simplification Phase 4B.2 — lifecycle status label for the header, distinct
// from DraftStatusLabel (which only ever describes local Save state). Never
// collapses CHANGES_REQUESTED into a visually anonymous "editing" state
// (Section N) — the Contractor must see that PM returned a previous
// submission, not just find themselves back in an editable Gantt with no
// explanation.
function LifecycleStatusLabel({ displayStatus, baselineRevisionNumber }) {
  const { text, tone } = displayStatus === "PENDING_REVIEW"
    ? { text: "Pending PM Review", tone: "warning" }
    : displayStatus === "CHANGES_REQUESTED"
      ? { text: "Changes Requested", tone: "danger" }
      : displayStatus === "APPROVED"
        ? { text: `Approved Baseline${baselineRevisionNumber ? ` v${baselineRevisionNumber}` : ""}`, tone: "positive" }
        : { text: "Draft", tone: "neutral" };
  return <FieldStatus tone={tone}>{text}</FieldStatus>;
}

function SubmitModal({ completeness, onConfirm, onClose }) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(comment.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} titleId="submit-schedule-title">
      <FieldModalContent
        title="Submit Schedule"
        titleId="submit-schedule-title"
        description="The submitted schedule will be frozen for PM review. Editing will be locked until the PM makes a decision."
        footer={<><FieldButton onClick={onClose} disabled={submitting}>Cancel</FieldButton><FieldButton onClick={handleConfirm} disabled={submitting} variant="primary">{submitting ? "Submitting…" : "Submit Schedule"}</FieldButton></>}
      >
        <div className="mb-2.5 text-sm text-field-secondary">
          Scheduled WPs: <strong className="text-field-body">{completeness.scheduledCount} / {completeness.totalCount}</strong>
        </div>
        <label className="mb-1.5 block text-sm font-semibold text-field-secondary" htmlFor="submit-schedule-comment">
          Comment for the PM (optional)
        </label>
        <textarea
          id="submit-schedule-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className={FIELD_TEXTAREA_CLASS}
        />
      </FieldModalContent>
    </Modal>
  );
}

function PmCommentBanner({ version, onViewSubmission }) {
  return (
    <FieldAlert title="Changes Requested by PM" action={<FieldButton
        onClick={onViewSubmission}
        variant="ghost"
        className="min-h-0 p-0 text-sm text-field-danger underline"
      >
        View the submitted schedule PM reviewed →
      </FieldButton>}>
      {version.pmComment || null}
    </FieldAlert>
  );
}

function ContractorSchedule({ projects = [] }) {
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
      .catch((error) => {
        // Same convergence as ContractorReport.jsx: an unauthorized project
        // (filtered out by RLS) and a genuinely nonexistent one produce the
        // identical generic "no rows" failure here — never distinguished,
        // so this message can never leak which case it was.
        if (isMounted) setContextError(error?.message || "Failed to load project");
      })
      .finally(() => { if (isMounted) setContextLoading(false); });
    return () => { isMounted = false; };
  }, [projectId, projects]);

  const scheduleIsContractorManaged = isContractorManaged(project?.scheduleOwnershipMode);
  // Contractor Draft ownership (Phase 3C.1): editable controls render only
  // for the real, logged-in Contractor session — see this file's top
  // comment for why Admin/PM/Viewer must never reach the editable branch
  // below even though Admin's route-level access is otherwise unchanged.
  const isContractorRole = role === ROLES.CONTRACTOR;
  const isContractorSession = scheduleIsContractorManaged && isContractorRole;

  // Simplification Phase 4B.2: submission lifecycle (Submit / PM Review /
  // Approved Baseline) layered over the existing Contractor Draft
  // foundation. The server (save_contractor_schedule_draft's own lifecycle
  // lock, migrations 050/051) remains the final authority regardless of
  // what canEdit computes here — this is a display/UX gate only.
  const {
    loading: submissionLoading, displayStatus, versions,
    pendingVersion, approvedVersion, latestVersion,
    canEditDraft: capabilityCanEditDraft, submit, actionPending,
  } = useScheduleSubmission({ projectId: isContractorSession ? projectId : null });

  const canEdit = isContractorSession && capabilityCanEditDraft;

  const scheduleSetup = useContractorScheduleSetup({ projectId, enabled: canEdit });
  const [showSetupEditor, setShowSetupEditor] = useState(false);
  const editingScheduleSetup = Boolean(scheduleSetup.executionScope)
    && (!scheduleSetup.configured || showSetupEditor);
  const scheduleDraftAvailable = !scheduleSetup.loading && !scheduleSetup.error
    && !editingScheduleSetup
    && (!scheduleSetup.executionScope || scheduleSetup.configured);

  const { tasks, dirty, changedCount, stageTaskDates, discardAllChanges, saveDraft, saving, saveError, completeness } =
    useContractorScheduleDraft({
      projectId: canEdit && scheduleDraftAvailable ? projectId : null,
      refreshKey: scheduleSetup.revision,
    });

  const handleSaveSetup = useCallback(async () => {
    try {
      const result = await scheduleSetup.save();
      setShowSetupEditor(false);
      toast.success(`${result.activityCount} schedule activities saved.`);
    } catch {
      toast.error("Couldn't save Schedule Setup — please review the Work Group coverage.");
    }
  }, [scheduleSetup, toast]);

  const handleSave = useCallback(async () => {
    try {
      await saveDraft();
      toast.success(changedCount === 1 ? "1 task saved" : `${changedCount} tasks saved`);
    } catch {
      // saveDraft already left the local Draft untouched (atomic RPC — a
      // thrown error means nothing was persisted); this is display only.
      toast.error("Couldn't save the schedule — please try again.");
    }
  }, [saveDraft, toast, changedCount]);

  const handleDiscard = useCallback(() => {
    discardAllChanges();
    toast.success("Changes discarded");
  }, [discardAllChanges, toast]);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  // The submission currently being viewed read-only — defaults to whichever
  // is locking editing (PENDING_REVIEW/APPROVED); the Contractor can also
  // explicitly peek at the CHANGES_REQUESTED submission PM returned, or
  // pick any older one from history (Section G/M) — set via
  // setPeekVersionId in either case, always overridable back to null (the
  // editable Draft) only when editing is actually possible.
  const [peekVersionId, setPeekVersionId] = useState(null);
  const lockedVersionId = pendingVersion?.id ?? approvedVersion?.id ?? null;
  const readOnlyVersionId = peekVersionId ?? lockedVersionId;
  const showingReadOnlyView = readOnlyVersionId != null;
  const readOnlyVersion = versions.find((v) => String(v.id) === String(readOnlyVersionId)) || null;

  const { tasks: snapshotTasks, loading: snapshotLoading, completeness: snapshotCompleteness } =
    useScheduleVersionSnapshot({ projectId, versionId: showingReadOnlyView ? readOnlyVersionId : null });

  const handleSubmit = useCallback(async (comment) => {
    const outcome = await submit(comment);
    setShowSubmitModal(false);
    if (outcome.ok) {
      toast.success("Schedule submitted for PM review.");
    } else {
      toast.error(outcome.error.message);
    }
  }, [submit, toast]);

  const isChangesRequested = displayStatus === "CHANGES_REQUESTED";

  // Protects browser unload, browser Back/Forward, AND ordinary in-app
  // navigation (guardLinkClick/guardedNavigate below) — see
  // useUnsavedChangesGuard's own header for the full contract and its
  // documented limitations. No autosave: Save Draft remains the only write.
  // `dirty` can only ever be true when canEdit is true (useContractorScheduleDraft
  // is given a null projectId otherwise), so PENDING_REVIEW/APPROVED pages
  // never show a false "unsaved changes" warning (Section O).
  const { guardLinkClick, guardedNavigate } = useUnsavedChangesGuard(dirty || scheduleSetup.dirty);

  if (!project && contextLoading) return <LoadingReportState />;
  if (!project) return <ProjectNotFoundState message={contextError} />;
  if (!scheduleIsContractorManaged) return <ScheduleUnavailableState project={project} />;
  if (!isContractorRole) return <ScheduleUnavailableState project={project} reason="role" />;

  return (
    <FieldPage>
      <FieldContainer>
        <FieldPageHeader
          navigation={<>
            <FieldButton
              onClick={() => guardedNavigate("/contractor-select")}
              variant="ghost"
              className="min-h-0 p-0 text-sm"
            >
              ← Workspace
            </FieldButton>
            <Link
              to={`/contractor-report/${project.id}`}
              onClick={(e) => guardLinkClick(e, `/contractor-report/${project.id}`)}
              className="text-field-secondary hover:text-field-primary"
            >
              Report
            </Link>
            <Link
              to={`/field-snag/${project.id}`}
              onClick={(e) => guardLinkClick(e, `/field-snag/${project.id}`)}
              className="text-field-secondary hover:text-field-primary"
            >
              Observations
            </Link>
          </>}
          eyebrow={project.storeCode}
          title={project.shoppingMallName || "Contractor Schedule"}
          metadata={[
            { label: 'Construction Start', value: fmtDate(project.constructionStartDate) },
            { label: 'Required Completion', value: fmtDate(project.constructionEndDate) },
            { label: 'Opening', value: fmtDate(project.targetOpeningDate) },
          ]}
          status={canEdit && !showingReadOnlyView ? (
              <DraftStatusLabel dirty={dirty} saving={saving} saveError={saveError} />
            ) : (
              <LifecycleStatusLabel
                displayStatus={showingReadOnlyView ? readOnlyVersion?.status : displayStatus}
                baselineRevisionNumber={approvedVersion?.baselineRevisionNumber}
              />
            )}
        />

        <main>
          {submissionLoading ? (
            <FieldLoading>Loading schedule status…</FieldLoading>
          ) : showingReadOnlyView ? (
            <>
              <SubmissionSnapshotView
                project={project}
                version={readOnlyVersion}
                tasks={snapshotTasks}
                loading={snapshotLoading}
                contractorEmail={project.contractorEmail}
                completeness={snapshotCompleteness}
              />
              {canEdit && (
                <FieldButton
                  onClick={() => setPeekVersionId(null)}
                  variant="ghost"
                  className="mt-3.5 min-h-0 p-0 text-sm"
                >
                  ← Back to my Draft
                </FieldButton>
              )}
            </>
          ) : (
            <>
              {isChangesRequested && latestVersion && (
                <PmCommentBanner version={latestVersion} onViewSubmission={() => setPeekVersionId(latestVersion.id)} />
              )}
              {scheduleSetup.loading ? (
                <FieldLoading>Loading Execution Scope…</FieldLoading>
              ) : scheduleSetup.error ? (
                <FieldLoading danger>Couldn't load the current Execution Scope. Reload the page before editing the schedule.</FieldLoading>
              ) : editingScheduleSetup ? (
                <ContractorScheduleSetupEditor
                  executionScope={scheduleSetup.executionScope}
                  activities={scheduleSetup.activities}
                  issues={scheduleSetup.issues}
                  dirty={scheduleSetup.dirty}
                  saving={scheduleSetup.saving}
                  onUpdate={scheduleSetup.updateActivity}
                  onAdd={scheduleSetup.addActivity}
                  onRemove={scheduleSetup.removeActivity}
                  onDiscard={() => {
                    scheduleSetup.discard();
                    if (scheduleSetup.configured) setShowSetupEditor(false);
                  }}
                  onSave={handleSaveSetup}
                />
              ) : tasks.length === 0 ? (
                <FieldPanel className="flex h-50 items-center justify-center text-sm text-field-secondary" role="status">
                  No work packages are available for scheduling.
                </FieldPanel>
              ) : (
                <React.Suspense fallback={<FieldLoading className="p-6">Loading schedule…</FieldLoading>}>
                  <GanttChart
                    project={project}
                    tasks={tasks}
                    keyDates={{
                      constructionStartDate: project.constructionStartDate,
                      constructionEndDate:   project.constructionEndDate,
                      targetOpeningDate:     project.targetOpeningDate,
                    }}
                    onWPResize={stageTaskDates}
                    onWPMove={stageTaskDates}
                    onManualDateChange={stageTaskDates}
                  />
                </React.Suspense>
              )}
              {scheduleSetup.executionScope && scheduleSetup.configured && !editingScheduleSetup && (
                <FieldButton
                  onClick={() => setShowSetupEditor(true)}
                  className="mt-3.5 min-h-8 px-3"
                >
                  Edit Schedule Setup
                </FieldButton>
              )}
            </>
          )}
        </main>

        {versions.length >= 2 && (
          <div className="mt-4">
            <SubmissionHistoryList versions={versions} selectedVersionId={readOnlyVersionId} onSelect={setPeekVersionId} />
          </div>
        )}
      </FieldContainer>

      {/* Footer / action area — sticky so Save Draft stays reachable while
          scrolling a long task list, including at narrow/mobile widths.
          Only rendered while actually editing the Draft — PENDING_REVIEW/
          APPROVED/read-only-peek states have no Save/Submit action at all. */}
      {canEdit && scheduleDraftAvailable && !showingReadOnlyView && (
        <FieldStickyActions>
          <div>
            <DraftStatusLabel dirty={dirty} saving={saving} saveError={saveError} />
            <div className="mt-0.5 text-xs text-field-muted">
              Scheduled WPs: {completeness.scheduledCount} / {completeness.totalCount}
              {!completeness.isComplete && completeness.totalCount > 0 && (
                <span> — unscheduled: {completeness.unscheduledWpIds.join(", ")}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <FieldButton
              onClick={handleDiscard}
              disabled={!dirty || saving}
            >
              Discard changes
            </FieldButton>
            <FieldButton
              onClick={handleSave}
              disabled={!dirty || saving}
              variant="primary"
              className="px-6"
            >
              {saving ? "Saving…" : `Save Draft${changedCount > 0 ? ` (${changedCount})` : ""}`}
            </FieldButton>
            <FieldButton
              onClick={() => setShowSubmitModal(true)}
              disabled={dirty || saving || !completeness.isComplete || actionPending}
              title={dirty ? "Save Draft before submitting" : !completeness.isComplete ? "Schedule every active work package first" : undefined}
              variant="primary"
              className="px-6"
            >
              {actionPending ? "Submitting…" : "Submit Schedule"}
            </FieldButton>
          </div>
        </FieldStickyActions>
      )}

      {showSubmitModal && (
        <SubmitModal completeness={completeness} onConfirm={handleSubmit} onClose={() => setShowSubmitModal(false)} />
      )}
    </FieldPage>
  );
}

export default ContractorSchedule;
