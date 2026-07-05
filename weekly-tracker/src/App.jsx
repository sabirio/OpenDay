import { useState, useEffect, useMemo, Component, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import { getDefaultRoute } from "./engines/permissionEngine";
import * as projectService from "./services/projectService";
import * as contractorReportService from "./services/contractorReportService";
import * as siteVisitService from "./services/siteVisitService";
import { fetchAllTemplates } from "./data/templatesApi";
import { constructionRetailV1 } from "./domains/construction/templates/constructionRetailV1";

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)', color: 'var(--text-muted)', fontFamily: 'sans-serif', gap: 12 }}>
      <div style={{ width: 20, height: 20, border: '3px solid var(--border)', borderTopColor: 'var(--status-warn)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 15 }}>Loading project data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function RouteLoadingScreen() {
  return (
    <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: "sans-serif" }}>
      Loading...
    </div>
  );
}

function GlobalErrorScreen({ error, onRetry }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, fontFamily: 'sans-serif', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <div style={{ fontSize: 40 }}>🔌</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>Failed to load data</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, textAlign: 'center' }}>
        {error || 'Could not connect to the database. Check your network and try again.'}
      </div>
      <button
        onClick={onRetry}
        style={{ marginTop: 8, padding: '8px 24px', background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
      >
        Retry
      </button>
    </div>
  );
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
  const [dataState, setDataState] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [dataError, setDataError] = useState(null);

  const templatesById = useMemo(
    () => Object.fromEntries(templates.map(t => [t.id, t])),
    [templates]
  );
  const activeTemplateFallback = useMemo(
    () => templates.find(t => t.isActive) ?? null,
    [templates]
  );

  function loadData() {
    setDataState('loading');
    setDataError(null);
    Promise.all([
      projectService.getAll(),
      contractorReportService.getAllReportsForScreens(),
      siteVisitService.getAll(),
      fetchAllTemplates(),
    ]).then(([p, r, s, t]) => {
      setProjects(p);
      setReports(r);
      setSiteVisits(s);
      setTemplates(t);
      setDataState('ready');
    }).catch((err) => {
      console.error("Failed to load data from Supabase:", err);
      setDataError(err?.message || 'Unknown error');
      setDataState('error');
    });
  }

  // Load all data from Supabase whenever the user logs in
  useEffect(() => {
    if (!isAuthenticated) {
      setProjects([]);
      setReports([]);
      setSiteVisits([]);
      setTemplates([]);
      setDataState('idle');
      setDataError(null);
      return;
    }
    loadData();
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

  if (isAuthenticated && dataState === 'loading' && !isContractorReportRoute) return <GlobalLoadingScreen />;
  if (isAuthenticated && dataState === 'error' && !isContractorReportRoute) return <GlobalErrorScreen error={dataError} onRetry={loadData} />;

  return (
    <ErrorBoundary>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<RouteLoadingScreen />}>
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
              <ContractorSelect projects={projects} />
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
      </Suspense>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
