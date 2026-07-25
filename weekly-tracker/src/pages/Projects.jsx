import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canAccessResource } from "../hooks/usePermission";
import { generateAndSaveGantt, regenerateGantt } from "../hooks/useGanttOrchestration";
import {
  getProjectById,
  checkProjectConflict,
  grantContractorInviteAccess,
  sendContractorInviteLink,
} from "../hooks/useProjectEditorOrchestration";
import ProjectScopeConfigurator from "../components/ProjectScopeConfigurator";
import ZonedScopeConfigurator from "../components/projects/ZonedScopeConfigurator";
import ProjectDetailPane from "../components/projects/ProjectDetailPane";
import PortfolioProjectList from "../components/projects/PortfolioProjectList";
import GcInvitationModal from "../components/projects/GcInvitationModal";
import ProjectEditorModal from "../components/projects/ProjectEditorModal";
import ExportProjectsButton from "../components/projects/ExportProjectsButton";
import { useToast } from "../components/shared/Toast.jsx";
import { V2_TEMPLATE_TYPE } from "../domains/construction/templates/retailFitoutV2";
import { LOCATION_TYPE_OPTIONS } from "../config/projectVocabulary";
import { computePageCount, clampPage, paginate } from "../hooks/usePortfolioPaginationPresentation";

const PORTFOLIO_PAGE_SIZE = 50;

const emptyProject = {
  storeCode: "",
  shoppingMallName: "",
  city: "",
  street: "",
  state: "",
  country: "",
  salesMarket: "",
  locationType: "",
  storeConcept: "",
  salesAreaSqm: "",
  backOfHouseAreaSqm: "",
  constructionStartDate: "",
  constructionEndDate: "",
  targetOpeningDate: "",
  actualConstructionStartDate: "",
  actualConstructionCompletionDate: "",
  actualOpeningDate: "",
  budget: "",
  currencyCode: "",
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
  const toast = useToast();
  const { role } = useAuth();
  const canImportProjects = canAccessResource(role, 'projects_import');
  const [showForm, setShowForm] = useState(false);
  const [newProject, setNewProject] = useState(emptyProject);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [salesMarketFilter, setSalesMarketFilter] = useState("All");
  const [locationTypeFilter, setLocationTypeFilter] = useState("All");
  const [searchQuery, setSearchQuery]     = useState("");
  // Master-detail workspace state — selection/pagination are Portfolio's own
  // presentation state, not a new data model (Portfolio's authorized
  // `projects` collection is unchanged).
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileView, setMobileView] = useState("list"); // 'list' | 'details' — only visually meaningful below the mobile breakpoint (see index.css)
  const [gcModal, setGcModal]                 = useState(null); // project being invited
  const [showScopeConfigurator, setShowScopeConfigurator] = useState(false);
  const [gcEmail, setGcEmail]             = useState('');
  const [initialGcEmail, setInitialGcEmail] = useState(''); // snapshot at open time, for GcInvitationModal's dirty-state check
  const [gcInviteStatus, setGcInviteStatus] = useState('idle'); // idle|sending|sent|error
  const [conflict, setConflict] = useState(null); // { serverUpdatedAt } — set when saveProject() detects a stale edit
  // Snapshot of newProject at the moment the editor opened — compared against
  // the live value to drive ProjectEditorModal's dirty-state close protection.
  const originalProjectRef = useRef(emptyProject);

  function openGcModal(project) {
    setGcEmail(project.contractorEmail || '');
    setInitialGcEmail(project.contractorEmail || '');
    setGcInviteStatus('idle');
    setGcModal(project);
  }

  async function handleGcInvite() {
    if (!gcEmail || !gcEmail.includes('@')) return;
    setGcInviteStatus('sending');

    // Step 1: grant access (idempotent — safe for repeated calls, multiple projects)
    const granted = await grantContractorInviteAccess(gcEmail);
    if (!granted) {
      setGcInviteStatus('error');
      return;
    }

    // Step 2: save email to this project
    await onSaveProject({ ...gcModal, contractorEmail: gcEmail });

    // Step 3: send magic link — skip gracefully if rate-limited (access is already granted)
    setGcInviteStatus(await sendContractorInviteLink(gcEmail));
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setNewProject((prev) => ({ ...prev, [name]: value }));
  }

  function handleEditProject(project) {
    const snapshot = {
      ...emptyProject,
      ...project,
      templateType: project.templateType || 'standard_with_demo',
      storeSizeSqm: project.storeSizeSqm || '',
      phases: project.phases || [],
    };
    setNewProject(snapshot);
    originalProjectRef.current = snapshot;
    setEditingProjectId(project.id);
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
        await checkProjectConflict(editingProjectId, newProject.updatedAt);
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
      let ganttFailed = false;
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
          ganttFailed = true;
        }
      }

      const wasEditing = Boolean(editingProjectId);
      setNewProject(emptyProject);
      originalProjectRef.current = emptyProject;
      setEditingProjectId(null);
      setConflict(null);
      setShowForm(false);
      toast.success(wasEditing ? "Project updated." : "Project created.");
      if (ganttFailed) toast.error("Project saved, but the schedule could not be regenerated. Reopen this project to try again.");
    } catch (err) {
      console.error("Failed to save project:", err);
      toast.error("Failed to save project. Please try again.");
    }
  }

  // Reload the current server copy of the project being edited, discarding
  // the user's local changes.
  async function discardConflict() {
    try {
      const fresh = await getProjectById(editingProjectId);
      const snapshot = {
        ...emptyProject,
        ...fresh,
        templateType: fresh.templateType || 'standard_with_demo',
        storeSizeSqm: fresh.storeSizeSqm || '',
        phases: fresh.phases || [],
      };
      setNewProject(snapshot);
      originalProjectRef.current = snapshot;
    } catch (err) {
      console.error("Failed to reload project:", err);
      toast.error("Failed to reload the latest data. Please close and reopen the editor.");
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
        toast.success(`${label} deleted.`);
      } catch (err) {
        console.error("Failed to delete project:", err);
        toast.error("Failed to delete project. Please try again.");
      }
    }
  }

  const activeCount = projects.filter((p) => p.projectStatus === "Active").length;
  const completedCount = projects.filter((p) => p.projectStatus === "Completed").length;

  const typeOptions = ["All", "New Opening", "Rebuilding"];
  const statusOptions = ["All", "Active", "Completed"];
  const countryOptions = ["All", ...Array.from(new Set(projects.map((p) => p.country).filter(Boolean))).sort()];
  const salesMarketOptions = ["All", ...Array.from(new Set(projects.map((p) => p.salesMarket).filter(Boolean))).sort()];
  const locationTypeOptions = ["All", ...LOCATION_TYPE_OPTIONS];

  const filtersActive = typeFilter !== "All" || statusFilter !== "All" || countryFilter !== "All" || salesMarketFilter !== "All" || locationTypeFilter !== "All" || searchQuery;
  const clearFilters = () => { setTypeFilter("All"); setStatusFilter("All"); setCountryFilter("All"); setSalesMarketFilter("All"); setLocationTypeFilter("All"); setSearchQuery(""); };

  const filteredProjects = projects.filter((project) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(project.storeCode || "").toLowerCase().includes(q) && !(project.shoppingMallName || "").toLowerCase().includes(q) && !(project.city || "").toLowerCase().includes(q)) return false;
    }
    const matchesType = typeFilter === "All" || project.projectType === typeFilter;
    const matchesStatus = statusFilter === "All" || project.projectStatus === statusFilter;
    const matchesCountry = countryFilter === "All" || project.country === countryFilter;
    const matchesSalesMarket = salesMarketFilter === "All" || project.salesMarket === salesMarketFilter;
    const matchesLocationType = locationTypeFilter === "All" || project.locationType === locationTypeFilter;
    return matchesType && matchesStatus && matchesCountry && matchesSalesMarket && matchesLocationType;
  });

  const pageCount = computePageCount(filteredProjects.length, PORTFOLIO_PAGE_SIZE);

  // Reset to page 1 whenever the active filters/search change, and clamp if
  // the page count shrinks for any other reason (e.g. a project is deleted).
  // Adjusted during render — React's documented pattern for resetting state
  // in response to a prop/derived-value change — rather than a useEffect, so
  // this render already reflects the corrected page with no extra round-trip.
  const filterSignature = JSON.stringify([searchQuery, typeFilter, statusFilter, countryFilter, salesMarketFilter, locationTypeFilter]);
  const prevFilterSignatureRef = useRef(filterSignature);
  let effectiveCurrentPage = prevFilterSignatureRef.current !== filterSignature ? 1 : currentPage;
  prevFilterSignatureRef.current = filterSignature;
  effectiveCurrentPage = clampPage(effectiveCurrentPage, pageCount);
  if (effectiveCurrentPage !== currentPage) setCurrentPage(effectiveCurrentPage);

  const pagedProjects = paginate(filteredProjects, effectiveCurrentPage, PORTFOLIO_PAGE_SIZE);

  // Keep selection valid for whatever is currently visible (initial load,
  // page change, or a filter change that moves the current selection off the
  // visible page): select the first visible project, or none. Same
  // render-time adjustment pattern as above.
  let effectiveSelectedProjectId = selectedProjectId;
  if (pagedProjects.length === 0) {
    effectiveSelectedProjectId = null;
  } else if (!pagedProjects.some((p) => p.id === selectedProjectId)) {
    effectiveSelectedProjectId = pagedProjects[0].id;
  }
  if (effectiveSelectedProjectId !== selectedProjectId) setSelectedProjectId(effectiveSelectedProjectId);

  const selectedProject = pagedProjects.find((p) => p.id === effectiveSelectedProjectId) ?? null;

  function selectProject(project) {
    setSelectedProjectId(project.id);
    setMobileView("details"); // no visual effect on desktop — see index.css
  }

  return (
    <div className="portfolio-page">
      {/* -- Page header -------------------------------------------------------- */}
      <div className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>Manage projects and generate contractor report links.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={() => { setNewProject(emptyProject); originalProjectRef.current = emptyProject; setEditingProjectId(null); setShowForm(true); }}
          >
            Add New Project
          </button>
          {canImportProjects && (
            <Link to="/projects/import" className="btn btn-secondary">
              Import Projects
            </Link>
          )}
          <ExportProjectsButton projects={filteredProjects} onError={(msg) => toast.error(msg)} />
        </div>
      </div>

      {/* -- Master-detail workspace: Project List | Project Details ----------- */}
      <div className="portfolio-workspace" data-mobile-view={mobileView}>
        <PortfolioProjectList
          pagedProjects={pagedProjects}
          totalFilteredCount={filteredProjects.length}
          totalProjects={projects.length}
          selectedProjectId={selectedProject?.id ?? null}
          onSelectProject={selectProject}
          onEditProject={handleEditProject}
          onInviteContractor={openGcModal}
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={PORTFOLIO_PAGE_SIZE}
          onPageChange={setCurrentPage}
          filterProps={{
            searchQuery,
            onSearchChange: setSearchQuery,
            salesMarketFilter,
            onSalesMarketChange: setSalesMarketFilter,
            salesMarketOptions,
            countryFilter,
            onCountryChange: setCountryFilter,
            countryOptions,
            statusFilter,
            onStatusChange: setStatusFilter,
            statusOptions,
            typeFilter,
            onTypeChange: setTypeFilter,
            typeOptions,
            locationTypeFilter,
            onLocationTypeChange: setLocationTypeFilter,
            locationTypeOptions,
            filtersActive,
            onClearFilters: clearFilters,
            filteredCount: filteredProjects.length,
            totalCount: projects.length,
            activeCount,
            completedCount,
          }}
        />

        <div className="portfolio-details-pane">
          {selectedProject ? (
            <ProjectDetailPane
              project={selectedProject}
              projects={projects}
              onEdit={() => handleEditProject(selectedProject)}
              onBack={() => setMobileView("list")}
            />
          ) : (
            <div className="portfolio-empty-state portfolio-details-empty">Select a project to view its details.</div>
          )}
        </div>
      </div>

      <GcInvitationModal
        project={gcModal}
        email={gcEmail}
        initialEmail={initialGcEmail}
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
          onChange={handleChange}
          onProjectPatch={setNewProject}
          onOpenScopeConfigurator={() => setShowScopeConfigurator(true)}
          onDelete={deleteProject}
          onSave={saveProject}
          onClose={() => { setConflict(null); setShowForm(false); }}
          conflict={conflict}
          onDiscardConflict={discardConflict}
          onOverwriteConflict={overwriteConflict}
          isDirty={JSON.stringify(newProject) !== JSON.stringify(originalProjectRef.current)}
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

