import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import WeeklyReports from "./pages/WeeklyReports";
import ContractorReport from "./pages/ContractorReport";
import SiteVisitReport from "./pages/SiteVisitReport";
import RiskDashboard from "./pages/RiskDashboard";
import Gantt from "./pages/Gantt";
import AdminUsers from "./pages/AdminUsers";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import ContractorSelect from "./pages/ContractorSelect";
import SiteVisitSelect from "./pages/SiteVisitSelect";
import Layout from "./components/Layout";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import { getDefaultRoute } from "./engines/permissionEngine";
import * as projectService from "./services/projectService";
import * as reportService from "./services/reportService";
import * as siteVisitService from "./services/siteVisitService";

// Redirect authenticated users away from /login
function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading, role } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to={getDefaultRoute(role)} replace />;
  return children;
}

function App() {
  const { isAuthenticated } = useAuth();

  const [projects, setProjects] = useState([]);
  const [reports, setReports] = useState([]);
  const [siteVisits, setSiteVisits] = useState([]);

  // Load all data from Supabase whenever the user logs in
  useEffect(() => {
    if (!isAuthenticated) {
      setProjects([]);
      setReports([]);
      setSiteVisits([]);
      return;
    }
    Promise.all([
      projectService.getAll(),
      reportService.getAll(),
      siteVisitService.getAll(),
    ]).then(([p, r, s]) => {
      setProjects(p);
      setReports(r);
      setSiteVisits(s);
    }).catch((err) => console.error("Failed to load data from Supabase:", err));
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

  async function handleSaveReport(report) {
    const saved = await reportService.create(report);
    setReports((prev) => [...prev, saved]);
    return saved;
  }

  async function handleSaveSiteVisit(visit) {
    const saved = await siteVisitService.create(visit);
    setSiteVisits((prev) => [...prev, saved]);
    return saved;
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
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
                onSaveReport={handleSaveReport}
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
                        <Dashboard projects={projects} reports={reports} siteVisits={siteVisits} />
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
                        <WeeklyReports projects={projects} reports={reports} />
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
                    path="/gantt"
                    element={
                      <ProtectedRoute resource="gantt_view">
                        <Gantt projects={projects} reports={reports} siteVisits={siteVisits} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/risk-engine"
                    element={
                      <ProtectedRoute resource="risk_engine">
                        <RiskDashboard projects={projects} reports={reports} siteVisits={siteVisits} />
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
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
