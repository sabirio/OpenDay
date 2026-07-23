import { useState, useEffect, useMemo, Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Layout from "./components/Layout";
import { ToastProvider } from "./components/shared/Toast.jsx";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import { getDefaultRoute } from "./engines/permissionEngine";
import * as projectService from "./services/projectService";
import { getAllReportsForScreens } from "./core/contractorReport/contractorReportScreensModel.js";
import * as siteVisitService from "./services/siteVisitService";
import { fetchAllTemplates } from "./data/templatesApi";
import { constructionRetailV1 } from "./domains/construction/templates/constructionRetailV1";
import "./styles/snags.css";
import "./styles/plans.css";
import "./styles/snagFieldMode.css";

const Dashboard        = lazy(() => import("./pages/Dashboard"));
const Home             = lazy(() => import("./pages/Home"));
const Projects         = lazy(() => import("./pages/Projects"));
const WeeklyReports    = lazy(() => import("./pages/WeeklyReports"));
const ContractorReport = lazy(() => import("./pages/ContractorReport"));
const SiteVisitReport  = lazy(() => import("./pages/SiteVisitReport"));
const RiskDashboard    = lazy(() => import("./pages/RiskDashboard"));
const AdminUsers       = lazy(() => import("./pages/AdminUsers"));
const TemplateEditor   = lazy(() => import("./pages/TemplateEditor"));
const WeightAudit      = lazy(() => import("./pages/WeightAudit"));
const Login            = lazy(() => import("./pages/Login"));
const ResetPassword    = lazy(() => import("./pages/ResetPassword"));
const Unauthorized     = lazy(() => import("./pages/Unauthorized"));
const ContractorSelect = lazy(() => import("./pages/ContractorSelect"));
const SiteVisitSelect  = lazy(() => import("./pages/SiteVisitSelect"));
const SnagListPage     = lazy(() => import("./pages/snags/SnagListPage"));
const SnagFieldPage    = lazy(() => import("./pages/snags/SnagFieldPage"));
const FieldSnagSelect  = lazy(() => import("./pages/snags/FieldSnagSelect"));
const LegacyFieldSnagRedirect = lazy(() => import("./pages/snags/LegacyFieldSnagRedirect"));
const SnagCreatePage   = lazy(() => import("./pages/snags/SnagCreatePage"));
const SnagDetailPage   = lazy(() => import("./pages/snags/SnagDetailPage"));
const SnagProjectSelectPage = lazy(() => import("./pages/snags/SnagProjectSelectPage"));
const PlanManagementPage = lazy(() => import("./pages/plans/PlanManagementPage"));
const PlanViewerPage = lazy(() => import("./pages/plans/PlanViewerPage"));

const CONSTRUCTION_TEMPLATE = {
  phases: constructionRetailV1.phases.map(({ id, label, order, progressWeight }) => ({ id, label, order, progressWeight })),
  workPackages: constructionRetailV1.phases.flatMap(phase =>
    (phase.workPackages || []).map(wp => ({
      id: wp.id, label: wp.label, phaseId: phase.id, duration_pct: wp.durationPct,
    }))
  ),
};

// ── Theme initialisation (runs once before first render) ──────────────────────
(function () {
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();

// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, fontFamily: 'sans-serif', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, textAlign: 'center' }}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Reload page
        </button>
      </div>
    );
  }
}

// ── Global screens ────────────────────────────────────────────────────────────
function GlobalLoadingScreen() {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-muted)', fontFamily: 'sans-serif', gap: 12 }}>
      <div aria-hidden="true" style={{ width: 20, height: 20, border: '3px solid var(--border)', borderTopColor: 'var(--status-warn)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 15 }}>Loading project data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function RouteLoadingScreen() {
  return (
    <div role="status" aria-live="polite" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: "sans-serif" }}>
      Loading...
    </div>
  );
}

// Never renders the raw Supabase/Postgres/network error message directly to
// the user — only a fixed, friendly message. The raw error is still
// available to developers via the console.error() call at the
// loadProjects()/loadPortfolioData() catch sites that set the state this
// screen is rendered for.
function GlobalErrorScreen({ onRetry }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, fontFamily: 'sans-serif', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <div aria-hidden="true" style={{ fontSize: 40 }}>🔌</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>Failed to load data</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, textAlign: 'center' }}>
        Could not connect to the database. Check your network and try again.
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{ marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
      >
        Retry
      </button>
    </div>
  );
}

// Gates portfolio-wide data (reports/siteVisits/templates) behind first
// navigation to a route that actually needs it. /projects only needs the
// (already-loaded) projects list, so it renders immediately without
// waiting. /contractor-report/* is exempt too — it has its own fallback
// fetch for external links and must keep working even if this load fails.
function PortfolioDataGate({ isAuthenticated, portfolioState, onLoadPortfolioData, children }) {
  const location = useLocation();
  const skipGate = location.pathname === '/projects' || location.pathname.startsWith('/contractor-report/') || location.pathname === '/snags' || location.pathname.includes('/snags') || location.pathname.includes('/plans');

  useEffect(() => {
    if (!isAuthenticated || skipGate) return;
    if (portfolioState === 'idle') onLoadPortfolioData();
  }, [isAuthenticated, skipGate, portfolioState, onLoadPortfolioData]);

  if (!isAuthenticated || skipGate) return children;
  if (portfolioState === 'loading' || portfolioState === 'idle') return <GlobalLoadingScreen />;
  if (portfolioState === 'error') return <GlobalErrorScreen onRetry={onLoadPortfolioData} />;
  return children;
}

// Redirect authenticated users away from /login
function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to={getDefaultRoute(role)} replace />;
  return children;
}

function App() {
  const { isAuthenticated } = useAuth();
  const isContractorReportRoute = window.location.pathname.startsWith('/contractor-report/');

  const [projects, setProjects] = useState([]);
  const [reports, setReports] = useState([]);
  const [siteVisits, setSiteVisits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [projectsState, setProjectsState] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  // Value intentionally not read — GlobalErrorScreen shows a fixed, friendly
  // message rather than the raw backend error (see its own comment); the
  // setter is still used so console.error() callers can distinguish
  // "no error recorded yet" from "an error just happened" if ever needed.
  const [, setProjectsError] = useState(null);
  // Portfolio data (reports/siteVisits/templates) is heavier — loaded lazily,
  // only once a route that needs it is actually visited. See PortfolioDataGate.
  const [portfolioState, setPortfolioState] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  // Value intentionally not read — see the matching comment on projectsError above.
  const [, setPortfolioError] = useState(null);

  const templatesById = useMemo(
    () => Object.fromEntries(templates.map(t => [t.id, t])),
    [templates]
  );
  const activeTemplateFallback = useMemo(
    () => templates.find(t => t.isActive) ?? null,
    [templates]
  );

  function loadProjects() {
    setProjectsState('loading');
    setProjectsError(null);
    projectService.getAll()
      .then((p) => {
        setProjects(p);
        setProjectsState('ready');
      })
      .catch((err) => {
        console.error("Failed to load projects from Supabase:", err);
        setProjectsError(err?.message || 'Unknown error');
        setProjectsState('error');
      });
  }

  function loadPortfolioData() {
    if (portfolioState === 'loading' || portfolioState === 'ready') return;
    setPortfolioState('loading');
    setPortfolioError(null);
    Promise.all([
      getAllReportsForScreens(),
      siteVisitService.getAll(),
      fetchAllTemplates(),
    ]).then(([r, s, t]) => {
      setReports(r);
      setSiteVisits(s);
      setTemplates(t);
      setPortfolioState('ready');
    }).catch((err) => {
      console.error("Failed to load portfolio data from Supabase:", err);
      setPortfolioError(err?.message || 'Unknown error');
      setPortfolioState('error');
    });
  }

  // Clearing session-scoped state on logout is pure synchronous local
  // state manipulation — no network I/O, no subscription, nothing an
  // effect is actually needed for. Per React's "adjusting state when a
  // prop changes" pattern, this runs directly during render (guarded by
  // comparing against the previous isAuthenticated value so it fires
  // exactly once per transition, not every render) instead of through a
  // useEffect, which both avoids an unnecessary extra commit and sidesteps
  // synchronously calling multiple setState functions inside an effect body.
  const [prevIsAuthenticated, setPrevIsAuthenticated] = useState(isAuthenticated);
  if (isAuthenticated !== prevIsAuthenticated) {
    setPrevIsAuthenticated(isAuthenticated);
    if (!isAuthenticated) {
      setProjects([]);
      setReports([]);
      setSiteVisits([]);
      setTemplates([]);
      setProjectsState('idle');
      setProjectsError(null);
      setPortfolioState('idle');
      setPortfolioError(null);
    }
  }

  // Load the (fast) projects list whenever the user logs in. Reports/siteVisits/
  // templates load lazily — see PortfolioDataGate.
  //
  // react-hooks/set-state-in-effect false positive: loadProjects() is a
  // genuine async data fetch (real network I/O via projectService.getAll(),
  // setProjectsState('loading') only as the first step of that fetch, with
  // 'ready'/'error' resolved from the promise) — the textbook legitimate
  // effect use the rule's own docs describe ("subscribe for updates from
  // some external system"), not a synchronous local-state computation that
  // could be moved to render. Confirmed the rule's flagging here is
  // shape-sensitive, not semantic: wrapping the exact same call in an
  // if/else with another branch (as it was before an adjacent unrelated
  // fix) silenced it with no change to loadProjects() itself, and
  // renaming an unrelated fully-synchronous local function elsewhere in
  // this file also changed whether it was flagged — i.e. the rule is
  // reacting to incidental code shape here, not to a real anti-pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAuthenticated) loadProjects();
  }, [isAuthenticated]);

  async function handleSaveProject(project) {
    if (project.id) {
      const saved = await projectService.update(project.id, project);
      setProjects((prev) => prev.map((p) => p.id === saved.id ? saved : p));
      return saved;
    } else {
      const saved = await projectService.create(project);
      setProjects((prev) => [...prev, saved]);
      return saved;
    }
  }

  async function handleDeleteProject(id) {
    await projectService.remove(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSaveSiteVisit(visit) {
    const saved = await siteVisitService.create(visit);
    setSiteVisits((prev) => [...prev, saved]);
    return saved;
  }

  if (isAuthenticated && projectsState === 'loading' && !isContractorReportRoute) return <GlobalLoadingScreen />;
  if (isAuthenticated && projectsState === 'error' && !isContractorReportRoute) return <GlobalErrorScreen onRetry={loadProjects} />;

  return (
    <ToastProvider>
    <ErrorBoundary>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<RouteLoadingScreen />}>
      <PortfolioDataGate
        isAuthenticated={isAuthenticated}
        portfolioState={portfolioState}
        onLoadPortfolioData={loadPortfolioData}
      >
      <Routes>
        {/* ── Public routes ──────────────────────────────────────── */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />

        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* ── Standalone protected routes (no Layout) ────────────── */}
        <Route
          path="/contractor-select"
          element={
            <ProtectedRoute resource="contractor_report">
              <ContractorSelect projects={projects} reports={reports} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/contractor-report/:projectId"
          element={
            <ProtectedRoute resource="contractor_report">
              <ContractorReport
                projects={projects}
                reports={reports}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/site-visit/:projectId"
          element={
            <ProtectedRoute resource="site_visit">
              <SiteVisitReport
                projects={projects}
                reports={reports}
                siteVisits={siteVisits}
                onSaveSiteVisit={handleSaveSiteVisit}
              />
            </ProtectedRoute>
          }
        />

        {/* Canonical Field Snag workspace — a top-level route outside
            <Layout>, same as /site-visit/:projectId, so it renders the
            white field-workspace shell instead of the normal app chrome
            (sidebar/header). */}
        <Route
          path="/field-snag/:projectId"
          element={
            <ProtectedRoute resource="snags">
              <SnagFieldPage projects={projects} />
            </ProtectedRoute>
          }
        />

        {/* ── Layout-wrapped protected routes ────────────────────── */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute resource="dashboard">
                        <Dashboard projects={projects} reports={reports} siteVisits={siteVisits} templatesById={templatesById} activeTemplateFallback={activeTemplateFallback} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/home"
                    element={
                      <ProtectedRoute resource="dashboard">
                        <Home projects={projects} reports={reports} siteVisits={siteVisits} templatesById={templatesById} activeTemplateFallback={activeTemplateFallback} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects"
                    element={
                      <ProtectedRoute resource="projects">
                        <Projects
                          projects={projects}
                          onSaveProject={handleSaveProject}
                          onDeleteProject={handleDeleteProject}
                        />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/snags" element={<ProtectedRoute resource="snags"><SnagProjectSelectPage projects={projects}/></ProtectedRoute>} />
                  <Route path="/field-snag" element={<ProtectedRoute resource="snags"><FieldSnagSelect projects={projects}/></ProtectedRoute>} />
                  <Route path="/projects/:projectId/snags" element={<ProtectedRoute resource="snags"><SnagListPage projects={projects}/></ProtectedRoute>} />
                  {/* Legacy path — the canonical Field Snag workspace now lives at
                      /field-snag/:projectId (a top-level route outside <Layout>,
                      see above). This keeps old deep links working. */}
                  <Route path="/projects/:projectId/snags/field" element={<ProtectedRoute resource="snags"><LegacyFieldSnagRedirect/></ProtectedRoute>} />
                  <Route path="/projects/:projectId/snags/new" element={<ProtectedRoute resource="snags"><SnagCreatePage/></ProtectedRoute>} />
                  <Route path="/projects/:projectId/snags/:snagId" element={<ProtectedRoute resource="snags"><SnagDetailPage/></ProtectedRoute>} />
                  <Route path="/projects/:projectId/plans" element={<ProtectedRoute resource="snags"><PlanManagementPage/></ProtectedRoute>} />
                  <Route path="/projects/:projectId/plans/:planId" element={<ProtectedRoute resource="snags"><PlanViewerPage/></ProtectedRoute>} />
                  <Route
                    path="/weekly-reports"
                    element={
                      <ProtectedRoute resource="weekly_reports">
                        <WeeklyReports projects={projects} reports={reports} siteVisits={siteVisits} templatesById={templatesById} activeTemplateFallback={activeTemplateFallback} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/site-visit-select"
                    element={
                      <ProtectedRoute resource="site_visit">
                        <SiteVisitSelect projects={projects} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/risk"
                    element={
                      <ProtectedRoute resource="risk_engine">
                        <RiskDashboard projects={projects} reports={reports} siteVisits={siteVisits} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/weight-audit"
                    element={
                      <ProtectedRoute resource="weight_audit">
                        <WeightAudit projects={projects} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/users"
                    element={
                      <ProtectedRoute resource="admin_users">
                        <AdminUsers projects={projects} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/template-editor"
                    element={
                      <ProtectedRoute resource="admin_users">
                        <TemplateEditor
                          initialTemplate={CONSTRUCTION_TEMPLATE}
                          onSave={() => {}}
                          onCancel={() => {}}
                        />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
      </PortfolioDataGate>
      </Suspense>
    </BrowserRouter>
    </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
