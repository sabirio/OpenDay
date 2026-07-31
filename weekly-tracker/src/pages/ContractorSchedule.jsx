import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES } from "../auth/rolePermissions";
import { isContractorManaged } from "../hooks/useScheduleOwnershipMode";
import { useToast } from "../components/shared/Toast.jsx";
import { loadContractorScheduleProjectFallback } from "../hooks/useContractorScheduleOrchestration";
import { useContractorScheduleDraft } from "../hooks/useContractorScheduleDraft";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
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
    <div style={{ minHeight: "100vh", background: "var(--field-bg-contractor)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 40, maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>—</div>
        <h2 style={{ color: "var(--field-text-heading)", marginBottom: 8 }}>Contractor Schedule unavailable</h2>
        <p style={{ color: "var(--field-text-secondary)" }}>{message}</p>
      </div>
    </div>
  );
}

function DraftStatusLabel({ dirty, saving, saveError }) {
  const { text, color } = saving
    ? { text: "Saving…", color: "var(--field-text-secondary)" }
    : saveError
      ? { text: "Save failed", color: "var(--field-danger-fg)" }
      : dirty
        ? { text: "Unsaved changes", color: "var(--field-warning-fg)" }
        : { text: "Saved", color: "var(--field-success-fg)" };
  return <span role="status" style={{ fontSize: 13, fontWeight: 600, color }}>{text}</span>;
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
  const canEdit = scheduleIsContractorManaged && isContractorRole;

  const { tasks, dirty, changedCount, stageTaskDates, discardAllChanges, saveDraft, saving, saveError } =
    useContractorScheduleDraft({ projectId: canEdit ? projectId : null });

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

  // Protects browser unload, browser Back/Forward, AND ordinary in-app
  // navigation (guardLinkClick/guardedNavigate below) — see
  // useUnsavedChangesGuard's own header for the full contract and its
  // documented limitations. No autosave: Save Draft remains the only write.
  const { guardLinkClick, guardedNavigate } = useUnsavedChangesGuard(dirty);

  if (!project && contextLoading) return <LoadingReportState />;
  if (!project) return <ProjectNotFoundState message={contextError} />;
  if (!scheduleIsContractorManaged) return <ScheduleUnavailableState project={project} />;
  if (!isContractorRole) return <ScheduleUnavailableState project={project} reason="role" />;

  return (
    <div className="field-form-page" style={{ minHeight: "100vh", background: "var(--field-bg-contractor)", padding: "28px 20px 110px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <nav style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 13 }}>
            <button
              type="button"
              onClick={() => guardedNavigate("/contractor-select")}
              style={{ background: "none", border: "none", padding: 0, color: "var(--field-text-secondary)", cursor: "pointer", fontSize: 13 }}
            >
              ← Workspace
            </button>
            <Link
              to={`/contractor-report/${project.id}`}
              onClick={(e) => guardLinkClick(e, `/contractor-report/${project.id}`)}
              style={{ color: "var(--field-text-secondary)" }}
            >
              Report
            </Link>
            <Link
              to={`/field-snag/${project.id}`}
              onClick={(e) => guardLinkClick(e, `/field-snag/${project.id}`)}
              style={{ color: "var(--field-text-secondary)" }}
            >
              Observations
            </Link>
          </nav>
          <div style={{ fontSize: 13, color: "var(--field-text-muted)", fontWeight: 600, letterSpacing: "0.02em" }}>
            {project.storeCode}
          </div>
          <h1 style={{ color: "var(--field-text-heading)", margin: "2px 0 14px", fontSize: 22 }}>
            {project.shoppingMallName || "Contractor Schedule"}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 13, color: "var(--field-text-secondary)" }}>
            <span>Construction Start: <strong style={{ color: "var(--field-text-body)" }}>{fmtDate(project.constructionStartDate)}</strong></span>
            <span>Required Completion: <strong style={{ color: "var(--field-text-body)" }}>{fmtDate(project.constructionEndDate)}</strong></span>
            <span>Opening: <strong style={{ color: "var(--field-text-body)" }}>{fmtDate(project.targetOpeningDate)}</strong></span>
          </div>
          <div style={{ marginTop: 10 }}>
            <DraftStatusLabel dirty={dirty} saving={saving} saveError={saveError} />
          </div>
        </header>

        <main>
          {tasks.length === 0 ? (
            <div role="status" style={{
              display: "flex", alignItems: "center", justifyContent: "center", height: 200,
              background: "var(--field-bg-card)", borderRadius: 12, border: "1px solid var(--field-border)",
              color: "var(--field-text-secondary)", fontSize: 14,
            }}>
              No work packages are available for scheduling.
            </div>
          ) : (
            <React.Suspense fallback={<div style={{ padding: 24, color: "var(--field-text-secondary)" }}>Loading schedule…</div>}>
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
        </main>
      </div>

      {/* Footer / action area — sticky so Save Draft stays reachable while
          scrolling a long task list, including at narrow/mobile widths. */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
        background: "var(--field-bg-card)", borderTop: "1px solid var(--field-border-strong)",
        padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "var(--field-shadow-lg)",
      }}>
        <DraftStatusLabel dirty={dirty} saving={saving} saveError={saveError} />
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!dirty || saving}
            style={{
              padding: "10px 18px", borderRadius: 10, border: "1px solid var(--field-border-strong)",
              background: "var(--field-bg-card)",
              color: (!dirty || saving) ? "var(--field-text-muted)" : "var(--field-text-secondary)",
              fontSize: 14, fontWeight: 600, cursor: (!dirty || saving) ? "not-allowed" : "pointer",
            }}
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: (!dirty || saving) ? "var(--field-neutral-bg)" : "var(--field-accent-contractor)",
              color: (!dirty || saving) ? "var(--field-text-muted)" : "var(--field-text-on-accent)",
              fontSize: 14, fontWeight: 700, cursor: (!dirty || saving) ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : `Save Draft${changedCount > 0 ? ` (${changedCount})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContractorSchedule;
