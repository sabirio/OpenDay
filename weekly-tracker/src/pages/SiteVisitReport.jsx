import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
// TODO wave4: legacy-report fallback (no Gantt plan) — mirrors the same dual-
// format design documented at the top of ContractorReport.jsx. Non-trivial to
// replace with masterTaskLibrary (different task-name vocabulary). Audited
// Wave 4 Step 4.6.
import { makeEmptyPMWPStatuses } from "../config/workPackages";
import { getProjectGantt } from "../services/ganttService";
import { submitSiteVisit } from "../services/siteVisitService";
import { getLastReport as getLastContractorReport } from "../services/contractorReportService";
import { useAuth } from "../auth/AuthContext";
import GanttSuccessView from "../components/sitevisit/GanttSuccessView";
import ComparisonResultsView from "../components/sitevisit/ComparisonResultsView";
import SiteVisitFormView from "../components/sitevisit/SiteVisitFormView";

// ── Main component ─────────────────────────────────────────────────────────

function SiteVisitReport({ projects, reports, onSaveSiteVisit }) {
  const { projectId } = useParams();
  const { user } = useAuth();
  const project = projects.find((p) => String(p.id) === projectId);

  const projectReports = [...(reports.filter((r) => String(r.projectId) === projectId))]
    .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt));

  const latestReport = projectReports[0] || null;

  const [form, setForm] = useState(() => ({
    visitDate: new Date().toISOString().split("T")[0],
    referenceReportId: latestReport?.id ? String(latestReport.id) : "",
    pmWorkPackageStatuses: makeEmptyPMWPStatuses(),
    pmScheduleAssessment: "",
    observations: "",
    photos: [],
    declarationConfirmed: false,
  }));

  const [errors, setErrors]       = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [savedVisit, setSavedVisit] = useState(null);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [photoError, setPhotoError] = useState(null);

  const [ganttTasks, setGanttTasks]           = useState([]);
  const [ganttLoading, setGanttLoading]       = useState(false);
  const [lastContractorReportId, setLastContractorReportId] = useState(null);
  const [pmWpObservations, setPmWpObservations] = useState({});

  useEffect(() => {
    if (!project?.id) return;
    setGanttLoading(true);
    getProjectGantt(project.id)
      .then(rawTasks => {
        const activeWPIds = project?.scope?.workPackages;
        const tasks = activeWPIds ? (rawTasks || []).filter(t => activeWPIds.includes(t.id)) : (rawTasks || []);
        setGanttTasks(tasks);
        // Pre-fill PM observations from current gantt progress
        const initial = {};
        for (const t of tasks) {
          initial[t.id] = { observed_progress: t.actual_progress ?? 0, observed_status: t.status ?? 'not_started', pm_note: '' };
        }
        setPmWpObservations(initial);
      })
      .catch(() => setGanttTasks([]))
      .finally(() => setGanttLoading(false));

    getLastContractorReport(project.id)
      .then(r => setLastContractorReportId(r?.id || null))
      .catch(() => {});
  }, [project?.id]);

  function updatePMObservation(wpId, updates) {
    setPmWpObservations(prev => ({ ...prev, [wpId]: { ...(prev[wpId] || {}), ...updates } }));
  }

  // Auto-select latest GC report once reports load from Supabase (async timing fix)
  useEffect(() => {
    if (latestReport?.id) {
      setForm((p) => ({
        ...p,
        referenceReportId: p.referenceReportId || String(latestReport.id),
      }));
    }
  }, [latestReport?.id]);

  const referenceReport = projectReports.find((r) => String(r.id) === String(form.referenceReportId));

  function set(name, value) { setForm((p) => ({ ...p, [name]: value })); }

  function updateWPTask(wpId, taskName, entry) {
    setForm((p) => ({
      ...p,
      pmWorkPackageStatuses: {
        ...p.pmWorkPackageStatuses,
        [wpId]: { ...p.pmWorkPackageStatuses[wpId], [taskName]: entry },
      },
    }));
  }

  // When reference report changes, keep PM statuses but update selection
  function handleReferenceChange(newId) {
    setForm((p) => ({ ...p, referenceReportId: newId }));
  }

  function validate() {
    const errs = [];
    if (!form.visitDate) errs.push("Visit date is required.");
    if (!form.pmScheduleAssessment) errs.push("PM schedule assessment is required.");
    if (!form.declarationConfirmed) errs.push("Declaration confirmation is required.");
    return errs;
  }

  function resetForm() {
    setForm({ visitDate: new Date().toISOString().split("T")[0], referenceReportId: latestReport?.id ? String(latestReport.id) : "", pmWorkPackageStatuses: makeEmptyPMWPStatuses(), pmScheduleAssessment: "", observations: "", photos: [], declarationConfirmed: false });
    setSavedVisit(null);
    setErrors([]);
    setPhotoUrls([]);
    setSubmitted(false);
  }

  async function submit() {
    const errs = validate();
    if (errs.length) { setErrors(errs); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setErrors([]);
    try {
      if (ganttTasks.length > 0) {
        // Build from ganttTasks (ordered) rather than pmWpObservations keys so we can
        // include gc_progress for each task to compute discrepancies in the service.
        const wpObservationsArray = ganttTasks.map(task => {
          const v = pmWpObservations[task.id] || {};
          return {
            wpId:              task.id,
            observed_progress: v.observed_progress ?? task.actual_progress ?? 0,
            observed_status:   v.observed_status   ?? task.status ?? 'not_started',
            pm_note:           v.pm_note           ?? '',
            gc_progress:       task.actual_progress ?? 0,
            gc_status:         task.status ?? 'not_started',
          };
        });
        const result = await submitSiteVisit(projectId, lastContractorReportId, wpObservationsArray, {
          visitDate:              form.visitDate,
          visitedBy:              user.id,
          overallNote:            form.observations || '',
          pmScheduleAssessment:   form.pmScheduleAssessment || null,
          photoUrls,
        });
        setSavedVisit({ ...form, ...result.siteVisit, discrepancies: result.discrepancies, _ganttFormat: true });
      } else {
        const visitData = {
          projectId,
          referenceReportId: form.referenceReportId || null,
          ...form,
          visitedBy: user.id,
          photos: photoUrls,
          photoUrls,
          submittedAt: new Date().toISOString(),
        };
        const saved = await onSaveSiteVisit(visitData);
        setSavedVisit(saved);
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Failed to submit site visit:", err);
      alert(`Site visit error: ${err?.message || JSON.stringify(err)}`);
    }
  }

  if (!project) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f7fa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗</div>
          <h2 style={{ color: "#111827", marginBottom: 8 }}>Project not found</h2>
          <p style={{ color: "#6b7280" }}>This link is invalid or the project has been removed.</p>
        </div>
      </div>
    );
  }

  if (submitted && savedVisit?._ganttFormat) {
    return (
      <GanttSuccessView
        project={project}
        form={form}
        ganttTasks={ganttTasks}
        pmWpObservations={pmWpObservations}
        onNewVisit={() => { setSavedVisit(null); setSubmitted(false); }}
      />
    );
  }

  if (submitted && savedVisit) {
    return (
      <ComparisonResultsView
        project={project}
        projectReports={projectReports}
        savedVisit={savedVisit}
        onNewVisit={resetForm}
      />
    );
  }

  return (
    <SiteVisitFormView
      project={project}
      projectReports={projectReports}
      form={form}
      set={set}
      errors={errors}
      referenceReport={referenceReport}
      handleReferenceChange={handleReferenceChange}
      updateWPTask={updateWPTask}
      ganttLoading={ganttLoading}
      ganttTasks={ganttTasks}
      pmWpObservations={pmWpObservations}
      updatePMObservation={updatePMObservation}
      onSubmit={submit}
      photoUrls={photoUrls}
      projectId={project.id}
      onPhotoUpload={(path) => setPhotoUrls((prev) => [...prev, path])}
      onPhotoError={(msg) => setPhotoError(msg)}
      photoError={photoError}
    />
  );
}

export default SiteVisitReport;
