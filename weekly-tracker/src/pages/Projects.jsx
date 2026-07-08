import { useState } from "react";
import { supabase } from "../lib/supabase";
import { generateAndSaveGantt, regenerateGantt } from "../hooks/useGanttOrchestration";
import { getById as getProjectById } from "../services/projectService";
import { checkConflict } from "../services/conflictGuard";
import ProjectScopeConfigurator from "../components/ProjectScopeConfigurator";
import ZonedScopeConfigurator from "../components/projects/ZonedScopeConfigurator";
import ProjectDetailModal from "../components/projects/ProjectDetailModal";
import GcInvitationModal from "../components/projects/GcInvitationModal";
import ProjectEditorModal from "../components/projects/ProjectEditorModal";
import ProjectFilters from "../components/projects/ProjectFilters";
import ProjectTable from "../components/projects/ProjectTable";
import { V2_TEMPLATE_TYPE } from "../domains/construction/templates/retailFitoutV2";

const emptyProject = {
  storeCode: "",
  shoppingMallName: "",
  city: "",
  street: "",
  state: "",
  country: "",
  salesMarket: "",
  constructionStartDate: "",
  constructionEndDate: "",
  targetOpeningDate: "",
  projectManager: "",
  securityManager: "",
  itManager: "",
  facilityManager: "",
  hrManager: "",
  supplyManager: "",
  generalContractor: "",
  contractorEmail: "",
  projectType: "New Opening",
  projectStatus: "Active",
  templateType: 'standard_with_demo',
  storeSizeSqm: '',
  phases: [],
};


const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
  fontSize: 13, color: "var(--text-primary)", background: "var(--bg-input)", outline: "none",
};


function Projects({ projects, onSaveProject, onDeleteProject }) {
  const [showForm, setShowForm] = useState(false);
  const [newProject, setNewProject] = useState(emptyProject);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [viewingProject, setViewingProject] = useState(null); // detail view
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [salesMarketFilter, setSalesMarketFilter] = useState("All");
  const [searchQuery, setSearchQuery]     = useState("");
  const [gcModal, setGcModal]                 = useState(null); // project being invited
  const [showScopeConfigurator, setShowScopeConfigurator] = useState(false);
  const [gcEmail, setGcEmail]             = useState('');
  const [gcInviteStatus, setGcInviteStatus] = useState('idle'); // idle|sending|sent|error
  const [conflict, setConflict] = useState(null); // { serverUpdatedAt } — set when saveProject() detects a stale edit

  function openGcModal(project) {
    setGcEmail(project.contractorEmail || '');
    setGcInviteStatus('idle');
    setGcModal(project);
  }

  async function handleGcInvite() {
    if (!gcEmail || !gcEmail.includes('@')) return;
    setGcInviteStatus('sending');

    // Step 1: grant access (idempotent — safe for repeated calls, multiple projects)
    const { data: rpcData, error: rpcError } = await supabase.rpc('invite_contractor', {
      contractor_email: gcEmail,
    });
    if (rpcError || rpcData?.error) {
      setGcInviteStatus('error');
      return;
    }

    // Step 2: save email to this project
    await onSaveProject({ ...gcModal, contractorEmail: gcEmail });

    // Step 3: send magic link — skip gracefully if rate-limited (access is already granted)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: gcEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/contractor-select`,
      },
    });

    if (otpError) {
      // Rate limit = user already exists, access still granted
      const isRateLimit = otpError.message?.toLowerCase().includes('rate') ||
                          otpError.status === 429;
      setGcInviteStatus(isRateLimit ? 'access_granted' : 'error');
    } else {
      setGcInviteStatus('sent');
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setNewProject((prev) => ({ ...prev, [name]: value }));
  }

  function handleEditProject(project) {
    setNewProject({
      ...emptyProject,
      ...project,
      templateType: project.templateType || 'standard_with_demo',
      storeSizeSqm: project.storeSizeSqm || '',
      phases: project.phases || [],
    });
    setEditingProjectId(project.id);
    setViewingProject(null);
    setConflict(null);
    setShowForm(true);
  }

  // Only checks for a conflict when editing an existing project — new
  // projects have no prior server state to collide with, and
  // contractor_reports/site_visits have no update-existing-row path at all
  // (every submission there is a new row; see conflictGuard.js usage note).
  async function saveProject() {
    if (editingProjectId) {
      const { conflict: isConflict, serverUpdatedAt } =
        await checkConflict('projects', editingProjectId, newProject.updatedAt);
      if (isConflict) {
        setConflict({ serverUpdatedAt });
        return;
      }
    }
    await doSaveProject();
  }

  async function doSaveProject() {
    try {
      const payload = editingProjectId ? { ...newProject, id: editingProjectId } : newProject;
      const savedProject = await onSaveProject(payload);

      const projectEndDate = newProject.constructionEndDate || newProject.targetOpeningDate;
      if (savedProject?.id && newProject.constructionStartDate && projectEndDate) {
        try {
          if (savedProject.ganttGeneratedAt) {
            // Gantt already exists — refresh planned dates without wiping actual_progress.
            await regenerateGantt(savedProject.id);
          } else {
            // First-time generation — tasks start at 0 (correct for new projects).
            // Scope configurator stores selected WPs in scope.workPackages; use those when present.
            const isV2 = newProject.templateType === V2_TEMPLATE_TYPE;
            const scopeWPIds = newProject.scope?.workPackages;
            const templateId = isV2
              ? V2_TEMPLATE_TYPE
              : (scopeWPIds?.length > 0 ? 'custom' : newProject.templateType || 'standard_with_demo');
            const tOptions = isV2
              ? {
                  zoneAreas: newProject.scope?.zoneAreas ?? {},
                  activeZoneIds: newProject.scope?.zones ?? null,
                  activeCategoryIds: newProject.scope?.categories ?? null,
                  selectedWPIds: newProject.scope?.workPackages ?? null,
                }
              : (scopeWPIds?.length > 0 ? { selectedWPIds: scopeWPIds } : {});
            await generateAndSaveGantt(
              savedProject.id,
              templateId,
              newProject.constructionStartDate,
              projectEndDate,
              parseFloat(newProject.storeSizeSqm) || 1000,
              tOptions,
            );
          }
        } catch (ganttErr) {
          console.warn('[gantt] generation failed (non-fatal):', ganttErr);
        }
      }

      setNewProject(emptyProject);
      setEditingProjectId(null);
      setConflict(null);
      setShowForm(false);
    } catch (err) {
      console.error("Failed to save project:", err);
      alert("Failed to save project. Please try again.");
    }
  }

  // Reload the current server copy of the project being edited, discarding
  // the user's local changes.
  async function discardConflict() {
    try {
      const fresh = await getProjectById(editingProjectId);
      setNewProject({
        ...emptyProject,
        ...fresh,
        templateType: fresh.templateType || 'standard_with_demo',
        storeSizeSqm: fresh.storeSizeSqm || '',
        phases: fresh.phases || [],
      });
    } catch (err) {
      console.error("Failed to reload project:", err);
      alert("Failed to reload the latest data. Please close and reopen the editor.");
    } finally {
      setConflict(null);
    }
  }

  // Save despite the conflict — the user has reviewed the warning and wants
  // their edit to win anyway.
  async function overwriteConflict() {
    setConflict(null);
    await doSaveProject();
  }

  async function deleteProject() {
    const label = newProject.storeCode || "this project";
    if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
      try {
        await onDeleteProject(editingProjectId);
        setNewProject(emptyProject);
        setEditingProjectId(null);
        setShowForm(false);
      } catch (err) {
        console.error("Failed to delete project:", err);
        alert("Failed to delete project. Please try again.");
      }
    }
  }

  const activeCount = projects.filter((p) => p.projectStatus === "Active").length;
  const completedCount = projects.filter((p) => p.projectStatus === "Completed").length;

  const typeOptions = ["All", "New Opening", "Rebuilding"];
  const statusOptions = ["All", "Active", "Completed"];
  const countryOptions = ["All", ...Array.from(new Set(projects.map((p) => p.country).filter(Boolean))).sort()];
  const salesMarketOptions = ["All", ...Array.from(new Set(projects.map((p) => p.salesMarket).filter(Boolean))).sort()];

  const filtersActive = typeFilter !== "All" || statusFilter !== "All" || countryFilter !== "All" || salesMarketFilter !== "All" || searchQuery;
  const clearFilters = () => { setTypeFilter("All"); setStatusFilter("All"); setCountryFilter("All"); setSalesMarketFilter("All"); setSearchQuery(""); };

  const filteredProjects = projects.filter((project) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(project.storeCode || "").toLowerCase().includes(q) && !(project.shoppingMallName || "").toLowerCase().includes(q) && !(project.city || "").toLowerCase().includes(q)) return false;
    }
    const matchesType = typeFilter === "All" || project.projectType === typeFilter;
    const matchesStatus = statusFilter === "All" || project.projectStatus === statusFilter;
    const matchesCountry = countryFilter === "All" || project.country === countryFilter;
    const matchesSalesMarket = salesMarketFilter === "All" || project.salesMarket === salesMarketFilter;
    return matchesType && matchesStatus && matchesCountry && matchesSalesMarket;
  });

  return (
    <div>
      {/* -- Page header -------------------------------------------------------- */}
      <div className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>Manage projects and generate contractor report links.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => { setNewProject(emptyProject); setEditingProjectId(null); setShowForm(true); }}
        >
          Add New Project
        </button>
      </div>

      <ProjectFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        salesMarketFilter={salesMarketFilter}
        onSalesMarketChange={setSalesMarketFilter}
        salesMarketOptions={salesMarketOptions}
        countryFilter={countryFilter}
        onCountryChange={setCountryFilter}
        countryOptions={countryOptions}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={statusOptions}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        typeOptions={typeOptions}
        filtersActive={filtersActive}
        onClearFilters={clearFilters}
        filteredCount={filteredProjects.length}
        totalCount={projects.length}
        activeCount={activeCount}
        completedCount={completedCount}
      />

      <ProjectTable
        projects={filteredProjects}
        totalProjects={projects.length}
        onViewProject={setViewingProject}
        onEditProject={handleEditProject}
        onInviteContractor={openGcModal}
      />

      {/* -- Project Detail Modal (read-only, opens on Store Code click) -------- */}
      {viewingProject && (
        <ProjectDetailModal
          project={viewingProject}
          onClose={() => setViewingProject(null)}
          onEdit={() => handleEditProject(viewingProject)}
        />
      )}

      <GcInvitationModal
        project={gcModal}
        email={gcEmail}
        status={gcInviteStatus}
        inputStyle={inputStyle}
        onEmailChange={setGcEmail}
        onStatusReset={() => setGcInviteStatus("idle")}
        onInvite={handleGcInvite}
        onClose={() => setGcModal(null)}
      />

      {showForm && (
        <ProjectEditorModal
          project={newProject}
          editingProjectId={editingProjectId}
          inputStyle={inputStyle}
          onChange={handleChange}
          onProjectPatch={setNewProject}
          onOpenScopeConfigurator={() => setShowScopeConfigurator(true)}
          onDelete={deleteProject}
          onSave={saveProject}
          onClose={() => { setConflict(null); setShowForm(false); }}
          conflict={conflict}
          onDiscardConflict={discardConflict}
          onOverwriteConflict={overwriteConflict}
        />
      )}

      {/* Scope Configurator modal — v2's zoned template gets its own fully
          isolated configurator; every other templateType keeps the existing
          flat phase/WP one, untouched. */}
      {showScopeConfigurator && (
        newProject.templateType === V2_TEMPLATE_TYPE ? (
          <ZonedScopeConfigurator
            initialScope={newProject.scope}
            areas={newProject.scope?.zoneAreas ?? {}}
            onSave={(scope) => {
              // ZonedScopeConfigurator only returns the zone/category/WP
              // selection — merge back the zoneAreas the user entered
              // separately in ProjectEditorModal's "Zone Areas" section
              // (edited independently, in whichever order) so saving scope
              // never wipes out already-entered areas.
              setNewProject(p => ({ ...p, scope: { ...scope, zoneAreas: p.scope?.zoneAreas ?? {} } }));
              setShowScopeConfigurator(false);
            }}
            onClose={() => setShowScopeConfigurator(false)}
          />
        ) : (
          <ProjectScopeConfigurator
            initialScope={newProject.scope}
            onSave={(scope) => {
              setNewProject(p => ({ ...p, scope }));
              setShowScopeConfigurator(false);
            }}
            onClose={() => setShowScopeConfigurator(false)}
          />
        )
      )}
    </div>
  );
}

export default Projects;

