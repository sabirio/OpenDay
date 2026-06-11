import { useNavigate } from 'react-router-dom';

function SiteVisitSelect({ projects = [] }) {
  const navigate = useNavigate();

  const activeProjects = projects.filter(p => p.projectStatus !== 'Completed');
  const completedProjects = projects.filter(p => p.projectStatus === 'Completed');

  function ProjectRow({ project }) {
    const daysToOpening = project.targetOpeningDate
      ? Math.ceil((new Date(project.targetOpeningDate) - new Date()) / 86400000)
      : null;
    const urgencyColor =
      daysToOpening === null ? '#6b7280'
      : daysToOpening < 0   ? '#dc2626'
      : daysToOpening < 30  ? '#dc2626'
      : daysToOpening < 90  ? '#f59e0b'
      : '#22c55e';

    const openingLabel =
      daysToOpening === null  ? null
      : daysToOpening < 0    ? `${Math.abs(daysToOpening)}d overdue`
      : daysToOpening === 0  ? 'Opening today'
      : `${daysToOpening}d · ${project.targetOpeningDate}`;

    return (
      <div
        onClick={() => navigate(`/site-visit/${project.id}`)}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1.5fr 1fr auto',
          alignItems: 'center',
          gap: 16,
          padding: '12px 18px',
          background: '#ffffff',
          borderBottom: '1px solid #f3f4f6',
          cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
      >
        {/* Store + Mall */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
            {project.storeCode || '—'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.shoppingMallName || '—'}
            {project.city && <span style={{ marginLeft: 6 }}>· {[project.city, project.country].filter(Boolean).join(', ')}</span>}
          </div>
        </div>

        {/* PM + opening */}
        <div style={{ minWidth: 0 }}>
          {project.projectManager && (
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{project.projectManager}</div>
          )}
          {openingLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: urgencyColor, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: urgencyColor, fontWeight: 600 }}>{openingLabel}</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div>
          <span style={{
            padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: project.projectStatus === 'Active' ? '#f0fdf4' : '#f9fafb',
            color: project.projectStatus === 'Active' ? '#16a34a' : '#6b7280',
            border: `1px solid ${project.projectStatus === 'Active' ? '#bbf7d0' : '#e5e7eb'}`,
          }}>
            {project.projectStatus || 'Active'}
          </span>
        </div>

        {/* CTA */}
        <button
          style={{
            padding: '7px 18px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #f97316 0%, #ea6c0a 100%)',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Start Visit →
        </button>
      </div>
    );
  }

  function ProjectGroup({ title, rows }) {
    if (rows.length === 0) return null;
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 8 }}>
          {title} — {rows.length}
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr auto',
            gap: 16,
            padding: '8px 18px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
          }}>
            {['Project', 'PM / Opening', 'Status', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280' }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          <div>
            {rows.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Site Visit</h1>
          <p>Select a project to record PM site observations.</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="dashboard-summary-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
          No projects available. Add projects first.
        </div>
      ) : (
        <>
          <ProjectGroup title="Active Projects" rows={activeProjects} />
          <ProjectGroup title="Completed Projects" rows={completedProjects} />
        </>
      )}
    </div>
  );
}

export default SiteVisitSelect;
