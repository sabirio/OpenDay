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
      daysToOpening === null ? '#64748b'
      : daysToOpening < 0   ? '#ef4444'
      : daysToOpening < 30  ? '#ef4444'
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
          background: '#1e293b',
          borderBottom: '1px solid #1e293b',
          cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#162032'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1e293b'; }}
      >
        {/* Store + Mall */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>
            {project.storeCode || '—'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.shoppingMallName || '—'}
            {project.city && <span style={{ marginLeft: 6 }}>· {[project.city, project.country].filter(Boolean).join(', ')}</span>}
          </div>
        </div>

        {/* PM + opening */}
        <div style={{ minWidth: 0 }}>
          {project.projectManager && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{project.projectManager}</div>
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
            background: project.projectStatus === 'Active' ? '#052e16' : '#1e293b',
            color: project.projectStatus === 'Active' ? '#86efac' : '#94a3b8',
            border: `1px solid ${project.projectStatus === 'Active' ? '#166534' : '#334155'}`,
          }}>
            {project.projectStatus || 'Active'}
          </span>
        </div>

        {/* CTA */}
        <button
          style={{
            padding: '7px 18px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #0c4a6e 0%, #0891b2 100%)',
            color: '#f0f9ff',
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
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 8 }}>
          {title} — {rows.length}
        </div>
        <div style={{ border: '1px solid #334155', borderRadius: 12, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr auto',
            gap: 16,
            padding: '8px 18px',
            background: '#0f172a',
            borderBottom: '1px solid #334155',
          }}>
            {['Project', 'PM / Opening', 'Status', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569' }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          <div>
            {rows.map((p, i) => (
              <div key={p.id} style={{ borderTop: i > 0 ? '1px solid #334155' : 'none' }}>
                <ProjectRow project={p} />
              </div>
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
        <div className="dashboard-summary-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
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
