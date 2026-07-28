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
import ProjectDetailPane, { ProjectDetailHeader } from "../components/projects/ProjectDetailPane";
import ProjectDetailTabs from "../components/projects/ProjectDetailTabs";
import { PROJECT_DETAIL_TABS } from "../components/projects/projectDetailConfig";
import PortfolioProjectList from "../components/projects/PortfolioProjectList";
import GcInvitationModal from "../components/projects/GcInvitationModal";
import ProjectEditorModal from "../components/projects/ProjectEditorModal";
import ExportProjectsButton from "../components/projects/ExportProjectsButton";
import { useToast } from "../components/shared/Toast.jsx";
import { V2_TEMPLATE_TYPE } from "../domains/construction/templates/retailFitoutV2";
import { LOCATION_TYPE_OPTIONS } from "../config/projectVocabulary";
import { computePageCount, clampPage, paginate } from "../hooks/usePortfolioPaginationPresentation";
import MasterDetailLayout from "../components/shared/MasterDetailLayout";
import {
  mergeProjectScopeSelection,
  PROJECT_AREA_BASIS,
  resolveEffectiveV2ZoneAreas,
  resolveProjectArea,
} from "../hooks/useProjectAreaPresentation";
import {
  initializeNewProjectScope,
  PROJECT_SCOPE_NOT_CONFIGURED,
} from "../hooks/useProjectScopeEntryPresentation";

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
  templateType: V2_TEMPLATE_TYPE,
  templateId: null,
  scopeTemplate: null,
  scope: null,
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
  const [mobileView, setMobileView] = useState("master");
  const [activeDetailTab, setActiveDetailTab] = useState("overview");
  const [gcModal, setGcModal]                 = useState(null); // project being invited
  const [showScopeConfigurator, setShowScopeConfigurator] = useState(false);
  const [isInitializingProject, setIsInitializingProject] = useState(false);
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

  async function openNewProject() {
    if (isInitializingProject) return;
    setIsInitializingProject(true);
    try {
      const draft = await initializeNewProjectScope(emptyProject);
      setNewProject(draft);
      originalProjectRef.current = draft;
      setEditingProjectId(null);
      setConflict(null);
      setShowForm(true);
    } catch (err) {
      console.error('Failed to initialize project scope:', err);
      toast.error(err?.message === PROJECT_SCOPE_NOT_CONFIGURED
        ? PROJECT_SCOPE_NOT_CONFIGURED
        : 'Project scope could not be loaded. Please try again.');
    } finally {
      setIsInitializingProject(false);
    }
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
                  zoneAreas: resolveEffectiveV2ZoneAreas(newProject),
                  activeZoneIds: newProject.scope?.zones ?? null,
                  activeCategoryIds: newProject.scope?.categories ?? null,
                  selectedWPIds: newProject.scope?.workPackages ?? null,
                  scopeTemplate: savedProject.scopeTemplate,
                }
              : (scopeWPIds?.length > 0 ? { selectedWPIds: scopeWPIds } : {});
            await generateAndSaveGantt(
              savedProject.id,
              templateId,
              newProject.constructionStartDate,
              projectEndDate,
              resolveProjectArea(newProject, PROJECT_AREA_BASIS.TOTAL_AREA) ?? 1000,
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

  // Phase 4 cross-page consistency fix: this used to re-derive selection from
  // pagedProjects, so any search/filter/pagination change that moved the
  // selected project off the visible page silently swapped the open detail
  // to a different project (or cleared it) without the user choosing
  // anything. Selection now persists against the full projects list — same
  // "filtering never silently swaps or clears the selected detail" contract
  // Weekly Reports/Risk Dashboard/Site Snag already use — and only falls
  // back to auto-selecting the first visible row when nothing is selected
  // yet, or the previous selection no longer exists at all (e.g. deleted).
  // Same render-time adjustment pattern as the page-count clamp above.
  const selectedProjectExists = selectedProjectId !== null && projects.some((p) => p.id === selectedProjectId);
  let effectiveSelectedProjectId = selectedProjectId;
  if (!selectedProjectExists) {
    effectiveSelectedProjectId = pagedProjects[0]?.id ?? null;
  }
  if (effectiveSelectedProjectId !== selectedProjectId) setSelectedProjectId(effectiveSelectedProjectId);

  const selectedProject = projects.find((p) => p.id === effectiveSelectedProjectId) ?? null;

  function selectProject(project) {
    setSelectedProjectId(project.id);
    setMobileView("detail");
  }

  return (
    <div className="portfolio-page" data-mobile-view={mobileView}>
      {/* -- Page header -------------------------------------------------------- */}
      <div className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>Manage projects and generate contractor report links.</p>
        </div>
        {/* Phase 5 responsive fix: these are portfolio-management actions, not
            actions on the selected project — below the master/detail mobile
            breakpoint they used to sit above the open project's detail as 3
            stacked full-width buttons, pushing the actual detail (what the
            user just tapped to see) below the fold. Hidden via
            .portfolio-page-actions while a project's detail is focused on
            mobile; still fully reachable by going back to the master list,
            same as before. Desktop is unaffected (no media query match). */}
        <div className="portfolio-page-actions">
          <button
            className="btn btn-primary"
            onClick={openNewProject}
            disabled={isInitializingProject}
          >
            {isInitializingProject ? 'Preparing Project…' : 'Add New Project'}
          </button>
          {canImportProjects && (
            <Link to="/projects/import" className="btn btn-secondary">
              Import Projects
            </Link>
          )}
          <ExportProjectsButton projects={filteredProjects} onError={(msg) => toast.error(msg)} />
        </div>
      </div>

      <MasterDetailLayout
        className="portfolio-master-detail"
        mobileView={mobileView}
        master={(
          <PortfolioProjectList
            pagedProjects={pagedProjects}
            totalFilteredCount={filteredProjects.length}
            totalProjects={projects.length}
            selectedProjectId={selectedProject?.id ?? null}
            onSelectProject={selectProject}
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
        )}
        detailHeader={selectedProject ? (
          <ProjectDetailHeader
            project={selectedProject}
            onEdit={() => handleEditProject(selectedProject)}
            onInvite={() => openGcModal(selectedProject)}
            onBack={() => setMobileView("master")}
          />
        ) : (
          <header className="detail-pane-header">
            <div className="dashboard-detail-title">No project selected</div>
          </header>
        )}
        detailTabs={selectedProject ? (
          <ProjectDetailTabs
            tabs={PROJECT_DETAIL_TABS}
            activeTab={activeDetailTab}
            onChange={setActiveDetailTab}
          />
        ) : null}
        detail={selectedProject ? (
          <div
            id="portfolio-detail-tabpanel"
            role="tabpanel"
            aria-labelledby={`portfolio-tab-${activeDetailTab}`}
            className="portfolio-detail-tabpanel"
          >
            <ProjectDetailPane
              project={selectedProject}
              projects={projects}
              activeTab={activeDetailTab}
            />
          </div>
        ) : (
          <div className="master-list-empty portfolio-detail-empty">Select a project to view its details.</div>
        )}
      />

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
            project={newProject}
            scopeTemplate={newProject.scopeTemplate}
            initialScope={newProject.scope}
            onSave={(scope) => {
              setNewProject(p => ({ ...p, scope: mergeProjectScopeSelection(p, scope) }));
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

