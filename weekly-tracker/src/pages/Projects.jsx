import { useState } from "react";
import { formatDate } from "../utils/reportUtils";
import { supabase } from "../lib/supabase";
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
  phases: [
    "Demolition works",
    "Construction works",
    "Testing & Commissioning",
    "Handover",
  ],
};

const PHASE_CONFIG = [
  { key: "Demolition works",        color: "#c4b5fd", bg: "#2e1065", border: "#7c3aed" },
  { key: "Construction works",      color: "#93c5fd", bg: "#1e3a5f", border: "#1d4ed8" },
  { key: "Testing & Commissioning", color: "#fcd34d", bg: "#422006", border: "#b45309" },
  { key: "Handover",                color: "#86efac", bg: "#052e16", border: "#166534" },
];

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "8px 12px", borderRadius: 8, border: "1px solid #475569",
  fontSize: 13, color: "#e2e8f0", background: "#0f172a", outline: "none",
};

// ── Shared form sub-components ──────────────────────────────────────────────

function FormSection({ title, accentColor, children }) {
  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ padding: "11px 20px", borderBottom: "1px solid #334155", borderLeft: `4px solid ${accentColor}`, background: "#0f172a" }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</h3>
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}

function FieldRow({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>{children}</div>;
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

// Read-only label for the detail view
function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ── Project Detail Modal (read-only) ────────────────────────────────────────

function ProjectDetailModal({ project, onClose, onEdit }) {
  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  const daysLeft = openingDate ? Math.ceil((openingDate - new Date()) / 86400000) : null;
  const openingColor = daysLeft === null ? "#e2e8f0" : daysLeft < 30 ? "#dc2626" : daysLeft < 90 ? "#d97706" : "#16a34a";

  const stakeholders = [
    { label: "Project Manager",   value: project.projectManager },
    { label: "General Contractor",value: project.generalContractor },
    { label: "Security Manager",  value: project.securityManager },
    { label: "IT Manager",        value: project.itManager },
    { label: "Facility Manager",  value: project.facilityManager },
    { label: "HR Manager",        value: project.hrManager },
    { label: "Supply Manager",    value: project.supplyManager },
  ].filter((s) => s.value);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: "95vw" }}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>{project.storeCode || "—"}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>{project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}</div>
            </div>
            <span style={{
              padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700,
              background: project.projectStatus === "Active" ? "#052e16" : "#1e293b",
              color: project.projectStatus === "Active" ? "#86efac" : "#94a3b8",
              border: `1px solid ${project.projectStatus === "Active" ? "#166534" : "#334155"}`,
            }}>{project.projectStatus}</span>
            <span style={{ padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: "#1e3a5f", color: "#93c5fd", border: "1px solid #1d4ed8" }}>
              {project.projectType}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="small-button" onClick={() => window.open(`/site-visit/${project.id}`, "_blank")} style={{ fontWeight: 600, background: "#1e3a5f", color: "#38bdf8", border: "1px solid #0891b2" }}>Site Visit</button>
            <button className="small-button" onClick={onEdit} style={{ fontWeight: 600 }}>Edit Project</button>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 72px)", padding: "20px 24px" }}>

          {/* Address */}
          <FormSection title="Address" accentColor="#3b82f6">
            <FieldRow>
              <DetailField label="Shopping Mall" value={project.shoppingMallName} />
              <DetailField label="Sales Market"  value={project.salesMarket} />
              <DetailField label="City"          value={project.city} />
              <DetailField label="State / Region" value={project.state} />
              <DetailField label="Street"        value={project.street} />
              <DetailField label="Country"       value={project.country} />
            </FieldRow>
          </FormSection>

          {/* Dates */}
          <FormSection title="Dates" accentColor="#f59e0b">
            <FieldRow>
              <DetailField label="Construction Start" value={project.constructionStartDate} />
              <DetailField label="Construction End"   value={project.constructionEndDate} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: 3 }}>Target Opening</div>
                {openingDate ? (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: openingColor }}>{formatDate(project.targetOpeningDate)}</div>
                    {daysLeft !== null && (
                      <div style={{ fontSize: 11, color: openingColor, marginTop: 2 }}>
                        {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)} days overdue`}
                      </div>
                    )}
                  </div>
                ) : <div style={{ fontSize: 13, color: "#94a3b8" }}>—</div>}
              </div>
            </FieldRow>
          </FormSection>

          {/* Stakeholders */}
          {stakeholders.length > 0 && (
            <FormSection title="Stakeholders" accentColor="#8b5cf6">
              <FieldRow>
                {stakeholders.map(({ label, value }) => (
                  <DetailField key={label} label={label} value={value} />
                ))}
              </FieldRow>
            </FormSection>
          )}

          {/* Construction Phases */}
          {(project.phases || []).length > 0 && (
            <FormSection title="Construction Phases" accentColor="#22c55e">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {PHASE_CONFIG.filter(({ key }) => (project.phases || []).includes(key)).map(({ key, color, bg, border }) => (
                  <span key={key} style={{
                    padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: bg, color, border: `1.5px solid ${border}`,
                  }}>{key}</span>
                ))}
              </div>
            </FormSection>
          )}

          {/* Contractor link */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginRight: 4 }}>Contractor Link</div>
            <a href={`/contractor-report/${project.id}`} className="contractor-link" style={{ flex: 1, fontSize: 13 }}>
              {window.location.origin}/contractor-report/{project.id}
            </a>
            <button className="small-button" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/contractor-report/${project.id}`);
              alert("Link copied.");
            }}>Copy</button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

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
  const [inviteStatus, setInviteStatus]   = useState({}); // { [email]: 'sending'|'sent'|'error' }
  const [gcModal, setGcModal]             = useState(null); // project being invited
  const [gcEmail, setGcEmail]             = useState('');
  const [gcInviteStatus, setGcInviteStatus] = useState('idle'); // idle|sending|sent|error

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

  async function handleInviteContractor(email) {
    if (!email || !email.includes('@')) return;
    setInviteStatus(prev => ({ ...prev, [email]: 'sending' }));

    // Step 1: pre-register role (works for new and existing users)
    const { data: rpcData, error: rpcError } = await supabase.rpc('invite_contractor', {
      contractor_email: email,
    });

    if (rpcError || rpcData?.error) {
      console.error('[invite]', rpcError || rpcData?.error);
      setInviteStatus(prev => ({ ...prev, [email]: 'error' }));
      setTimeout(() => setInviteStatus(prev => ({ ...prev, [email]: null })), 4000);
      return;
    }

    // Step 2: send magic link — redirect contractor to their landing page
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/contractor-select`,
      },
    });

    setInviteStatus(prev => ({ ...prev, [email]: otpError ? 'error' : 'sent' }));
    setTimeout(() => setInviteStatus(prev => ({ ...prev, [email]: null })), 4000);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setNewProject((prev) => ({ ...prev, [name]: value }));
  }

  function handleEditProject(project) {
    setNewProject({ ...emptyProject, ...project, phases: project.phases || emptyProject.phases });
    setEditingProjectId(project.id);
    setViewingProject(null);
    setShowForm(true);
  }

  function togglePhase(phase) {
    setNewProject((prev) => {
      const current = prev.phases || [];
      const next = current.includes(phase)
        ? current.filter((p) => p !== phase)
        : [...current, phase];
      return { ...prev, phases: next };
    });
  }

  async function saveProject() {
    try {
      if (editingProjectId) {
        await onSaveProject({ ...newProject, id: editingProjectId });
      } else {
        await onSaveProject(newProject);
      }
      setNewProject(emptyProject);
      setEditingProjectId(null);
      setShowForm(false);
    } catch (err) {
      console.error("Failed to save project:", err);
      alert("Failed to save project. Please try again.");
    }
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
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p>Manage projects and generate contractor report links.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => { setNewProject(emptyProject); setEditingProjectId(null); setShowForm(true); }}
        >
          Add New Project
        </button>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 13 }}>🔍</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…" style={{ paddingLeft: 32, paddingRight: 12, height: 36, borderRadius: 9, border: "1.5px solid #334155", fontSize: 13, color: "#e2e8f0", background: "#1e293b", outline: "none", minWidth: 180 }} />
        </div>
        {[
          { val: salesMarketFilter, set: setSalesMarketFilter, opts: salesMarketOptions, placeholder: "All markets" },
          { val: countryFilter,     set: setCountryFilter,     opts: countryOptions,     placeholder: "All countries" },
          { val: statusFilter,      set: setStatusFilter,      opts: statusOptions,      placeholder: "All statuses" },
          { val: typeFilter,        set: setTypeFilter,        opts: typeOptions,         placeholder: "All types" },
        ].map(({ val, set, opts, placeholder }, i) => (
          <select key={i} value={val} onChange={e => set(e.target.value)} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: "1.5px solid #334155", fontSize: 13, color: "#e2e8f0", background: "#1e293b", cursor: "pointer", outline: "none" }}>
            {opts.map(o => <option key={o} value={o}>{o === "All" ? placeholder : o}</option>)}
          </select>
        ))}
        {filtersActive && (
          <button type="button" onClick={clearFilters} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: "1.5px solid #7f1d1d", background: "#450a0a", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Clear ×</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{filteredProjects.length} / {projects.length} projects</span>
          <div className="metric-pill"><span>Active</span><strong>{activeCount}</strong></div>
          <div className="metric-pill" style={completedCount > 0 ? { background: "#1e293b", color: "#94a3b8", borderColor: "#475569" } : {}}><span>Completed</span><strong>{completedCount}</strong></div>
        </div>
      </div>

      {/* ── Projects table ───────────────────────────────────────────────────── */}
      <div className="dashboard-summary-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="dashboard-table" style={{ width: "100%", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th>Store Code</th>
                <th>Mall</th>
                <th>City</th>
                <th>Country</th>
                <th>Project Manager</th>
                <th>Type</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Target Opening</th>
                <th>Status</th>
                <th>Edit</th>
                <th>GC Access</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr><td colSpan="11" style={{ color: "#94a3b8", textAlign: "center", padding: 32 }}>
                  {projects.length === 0 ? "No projects yet. Click \"Add New Project\" to create one." : "No projects match the current filters."}
                </td></tr>
              ) : (
                filteredProjects.map((project) => {
                  const openingDate = project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
                  const daysLeft = openingDate ? Math.ceil((openingDate - new Date()) / 86400000) : null;
                  const openingColor = daysLeft === null ? "#e2e8f0" : daysLeft < 30 ? "#dc2626" : daysLeft < 90 ? "#d97706" : "#16a34a";
                  return (
                    <tr key={project.id} style={{ cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#1a2740"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ width: 3, height: 18, borderRadius: 2, background: "#60a5fa", flexShrink: 0 }} />
                          <button
                            onClick={() => setViewingProject(project)}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: "#f1f5f9", fontSize: 13 }}
                          >
                            {project.storeCode || "—"}
                          </button>
                        </div>
                      </td>
                      <td style={{ color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.shoppingMallName || "—"}</td>
                      <td style={{ color: "#94a3b8" }}>{project.city || "—"}</td>
                      <td style={{ color: "#94a3b8" }}>{project.country || "—"}</td>
                      <td style={{ color: "#94a3b8" }}>{project.projectManager || "—"}</td>
                      <td style={{ color: "#94a3b8" }}>{project.projectType}</td>
                      <td style={{ color: "#6b7280", whiteSpace: "nowrap" }}>{formatDate(project.constructionStartDate)}</td>
                      <td style={{ color: "#6b7280", whiteSpace: "nowrap" }}>{formatDate(project.constructionEndDate)}</td>
                      <td>
                        {openingDate ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: openingColor, whiteSpace: "nowrap" }}>{formatDate(project.targetOpeningDate)}</div>
                            <div style={{ fontSize: 11, color: openingColor }}>
                              {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)}d overdue`}
                            </div>
                          </div>
                        ) : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                          background: project.projectStatus === "Active" ? "#052e16" : "#1e293b",
                          color: project.projectStatus === "Active" ? "#86efac" : "#94a3b8",
                          border: `1px solid ${project.projectStatus === "Active" ? "#166534" : "#334155"}`,
                        }}>{project.projectStatus}</span>
                      </td>
                      <td>
                        <button className="text-button" onClick={e => { e.stopPropagation(); handleEditProject(project); }}>Edit</button>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={e => { e.stopPropagation(); openGcModal(project); }}
                          style={{ color: project.contractorEmail ? '#4ade80' : '#60a5fa' }}
                        >
                          {project.contractorEmail ? '✓ GC Invited' : 'GC Invite'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Project Detail Modal (read-only, opens on Store Code click) ──────── */}
      {viewingProject && (
        <ProjectDetailModal
          project={viewingProject}
          onClose={() => setViewingProject(null)}
          onEdit={() => handleEditProject(viewingProject)}
        />
      )}

      {/* ── GC Invitation modal ──────────────────────────────────────────────── */}
      {gcModal && (
        <div className="modal-overlay" onClick={() => setGcModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '95vw', padding: 0, overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    GC Portal Invitation
                  </p>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>
                    {gcModal.shoppingMallName || gcModal.storeCode}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                    {gcModal.storeCode} · {gcModal.city}, {gcModal.country}
                  </p>
                </div>
                <button
                  onClick={() => setGcModal(null)}
                  style={{ background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0 }}
                >✕</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px' }}>

              {/* Project info strip */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Contractor', value: gcModal.generalContractor || '—' },
                  { label: 'Opening',    value: gcModal.targetOpeningDate  || '—' },
                  { label: 'Status',     value: gcModal.projectStatus      || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ flex: 1, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Email input */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Contractor Email
                </label>
                <input
                  type="email"
                  value={gcEmail}
                  onChange={e => { setGcEmail(e.target.value); setGcInviteStatus('idle'); }}
                  style={{ ...inputStyle, fontSize: 14 }}
                  placeholder="gc@company.com"
                  autoFocus
                />
              </div>

              {/* Hint */}
              <p style={{ fontSize: 12, color: '#475569', margin: '8px 0 20px', lineHeight: 1.5 }}>
                The same email can be used across multiple projects — the contractor will see all assigned projects after login.
              </p>

              {/* Status messages */}
              {gcInviteStatus === 'sent' && (
                <div style={{ marginBottom: 20, padding: '12px 16px', background: '#052e16', border: '1px solid #166534', borderRadius: 10, fontSize: 13, color: '#4ade80', lineHeight: 1.5 }}>
                  <strong>✓ Invite sent</strong><br />
                  Magic link sent to <strong>{gcEmail}</strong>. The contractor will be logged in directly.
                </div>
              )}
              {gcInviteStatus === 'access_granted' && (
                <div style={{ marginBottom: 20, padding: '12px 16px', background: '#1e3a5f', border: '1px solid #1d4ed8', borderRadius: 10, fontSize: 13, color: '#93c5fd', lineHeight: 1.5 }}>
                  <strong>✓ Access granted</strong><br />
                  This contractor is already registered. They will see this project on their next login.
                </div>
              )}
              {gcInviteStatus === 'error' && (
                <div style={{ marginBottom: 20, padding: '12px 16px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 10, fontSize: 13, color: '#f87171', lineHeight: 1.5 }}>
                  <strong>✗ Something went wrong</strong><br />
                  Check the email address and try again.
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="secondary-button" onClick={() => setGcModal(null)}>Cancel</button>
                <button
                  className="primary-button"
                  onClick={handleGcInvite}
                  disabled={!gcEmail || !gcEmail.includes('@') || gcInviteStatus === 'sending'}
                  style={{ opacity: (!gcEmail || !gcEmail.includes('@')) ? 0.45 : 1, minWidth: 130 }}
                >
                  {gcInviteStatus === 'sending'      ? 'Sending…'
                    : gcInviteStatus === 'sent'       ? '✉ Resend Invite'
                    : gcInviteStatus === 'access_granted' ? '✉ Resend Link'
                    : '✉ Send Invite'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── New / Edit Project modal ─────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: "95vw" }}>

            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0 }}>{editingProjectId ? "Edit Project" : "New Project"}</h2>
                {newProject.storeCode && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{newProject.storeCode}</div>
                )}
              </div>
              <button className="close-button" onClick={() => setShowForm(false)}>×</button>
            </div>

            <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 72px)", padding: "20px 24px" }}>

              {/* Store Code */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280", marginBottom: 5 }}>Store Code</div>
                <input
                  name="storeCode"
                  value={newProject.storeCode}
                  onChange={handleChange}
                  placeholder="e.g. SE001"
                  style={{ ...inputStyle, maxWidth: 200, fontWeight: 700, fontSize: 15 }}
                />
              </div>

              {/* Address */}
              <FormSection title="Address" accentColor="#3b82f6">
                <FieldRow>
                  <Field label="Shopping Mall">
                    <input name="shoppingMallName" value={newProject.shoppingMallName} onChange={handleChange} style={inputStyle} placeholder="Mall name" />
                  </Field>
                  <Field label="Sales Market">
                    <input name="salesMarket" value={newProject.salesMarket || ""} onChange={handleChange} style={inputStyle} placeholder="e.g. Sweden" />
                  </Field>
                  <Field label="City">
                    <input name="city" value={newProject.city} onChange={handleChange} style={inputStyle} placeholder="City" />
                  </Field>
                  <Field label="State / Region">
                    <input name="state" value={newProject.state || ""} onChange={handleChange} style={inputStyle} placeholder="State or region" />
                  </Field>
                  <Field label="Street">
                    <input name="street" value={newProject.street || ""} onChange={handleChange} style={inputStyle} placeholder="Street address" />
                  </Field>
                  <Field label="Country">
                    <input name="country" value={newProject.country} onChange={handleChange} style={inputStyle} placeholder="Country" />
                  </Field>
                </FieldRow>
              </FormSection>

              {/* Dates */}
              <FormSection title="Dates" accentColor="#f59e0b">
                <FieldRow>
                  <Field label="Construction Start Date">
                    <input type="date" name="constructionStartDate" value={newProject.constructionStartDate} onChange={handleChange} style={inputStyle} />
                  </Field>
                  <Field label="Construction End Date">
                    <input type="date" name="constructionEndDate" value={newProject.constructionEndDate} onChange={handleChange} style={inputStyle} />
                  </Field>
                  <Field label="Target Opening Date">
                    <input type="date" name="targetOpeningDate" value={newProject.targetOpeningDate} onChange={handleChange} style={inputStyle} />
                  </Field>
                </FieldRow>
              </FormSection>

              {/* Stakeholders */}
              <FormSection title="Stakeholders" accentColor="#8b5cf6">
                <FieldRow>
                  <Field label="Project Manager">
                    <input name="projectManager" value={newProject.projectManager} onChange={handleChange} style={inputStyle} placeholder="Full name" />
                  </Field>
                  <Field label="General Contractor">
                    <input name="generalContractor" value={newProject.generalContractor} onChange={handleChange} style={inputStyle} placeholder="Company name" />
                  </Field>
                  <Field label="Security Manager">
                    <input name="securityManager" value={newProject.securityManager || ""} onChange={handleChange} style={inputStyle} placeholder="Full name" />
                  </Field>
                  <Field label="IT Manager">
                    <input name="itManager" value={newProject.itManager || ""} onChange={handleChange} style={inputStyle} placeholder="Full name" />
                  </Field>
                  <Field label="Facility Manager">
                    <input name="facilityManager" value={newProject.facilityManager || ""} onChange={handleChange} style={inputStyle} placeholder="Full name" />
                  </Field>
                  <Field label="HR Manager">
                    <input name="hrManager" value={newProject.hrManager || ""} onChange={handleChange} style={inputStyle} placeholder="Full name" />
                  </Field>
                  <Field label="Supply Manager">
                    <input name="supplyManager" value={newProject.supplyManager || ""} onChange={handleChange} style={inputStyle} placeholder="Full name" />
                  </Field>
                </FieldRow>
              </FormSection>

              {/* Construction Phases */}
              <FormSection title="Construction Phases" accentColor="#22c55e">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {PHASE_CONFIG.map(({ key, color, bg, border }) => {
                    const active = (newProject.phases || []).includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePhase(key)}
                        style={{
                          padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                          cursor: "pointer", transition: "all 0.15s ease",
                          border: `1.5px solid ${active ? color : border}`,
                          background: active ? bg : "#0f172a",
                          color: color,
                        }}
                      >
                        {key}
                      </button>
                    );
                  })}
                </div>
              </FormSection>

              {/* Project */}
              <FormSection title="Project" accentColor="#2f855a">
                <FieldRow>
                  <Field label="Project Type">
                    <div style={{ display: "flex", gap: 8 }}>
                      {["New Opening", "Rebuilding"].map((opt) => (
                        <button key={opt} type="button"
                          onClick={() => setNewProject((p) => ({ ...p, projectType: opt }))}
                          style={{
                            flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                            border: `1.5px solid ${newProject.projectType === opt ? "#2f855a" : "#334155"}`,
                            background: newProject.projectType === opt ? "#2f855a" : "#0f172a",
                            color: newProject.projectType === opt ? "white" : "#e2e8f0",
                          }}>{opt}</button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Project Status">
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ label: "Active", bg: "#16a34a" }, { label: "Completed", bg: "#7b5e57" }].map(({ label, bg }) => (
                        <button key={label} type="button"
                          onClick={() => setNewProject((p) => ({ ...p, projectStatus: label }))}
                          style={{
                            flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                            border: `1.5px solid ${newProject.projectStatus === label ? bg : "#334155"}`,
                            background: newProject.projectStatus === label ? bg : "#0f172a",
                            color: newProject.projectStatus === label ? "white" : "#e2e8f0",
                          }}>{label}</button>
                      ))}
                    </div>
                  </Field>
                </FieldRow>
              </FormSection>

              {/* Actions — Delete on left, Cancel + Save on right */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                <div>
                  {editingProjectId && (
                    <button
                      type="button"
                      onClick={deleteProject}
                      style={{
                        padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        border: "1.5px solid #7f1d1d", background: "#450a0a", color: "#fca5a5",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Delete Project
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="primary-button" onClick={saveProject}>
                    {editingProjectId ? "Save Changes" : "Create Project"}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Projects;
