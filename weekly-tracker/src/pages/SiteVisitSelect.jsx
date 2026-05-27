import { useNavigate } from 'react-router-dom';

function SiteVisitSelect({ projects = [] }) {
  const navigate = useNavigate();

  const activeProjects = projects.filter(p => p.projectStatus !== 'Completed');
  const completedProjects = projects.filter(p => p.projectStatus === 'Completed');

  function ProjectCard({ project }) {
    const daysToOpening = project.targetOpeningDate
      ? Math.ceil((new Date(project.targetOpeningDate) - new Date()) / 86400000)
      : null;
    const urgencyColor =
      daysToOpening === null ? '#94a3b8'
      : daysToOpening < 30  ? '#ef4444'
      : daysToOpening < 90  ? '#f59e0b'
      : '#22c55e';

    return (
      <div
        onClick={() => navigate(`/site-visit/${project.id}`)}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 14,
          padding: '20px 22px',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#0891b2';
          e.currentTarget.style.background = '#162032';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#334155';
          e.currentTarget.style.background = '#1e293b';
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>
              {project.storeCode || '—'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
              {project.shoppingMallName || '—'}
            </div>
          </div>
          <span style={{
            padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: project.projectStatus === 'Active' ? '#052e16' : '#1e293b',
            color: project.projectStatus === 'Active' ? '#86efac' : '#94a3b8',
            border: `1px solid ${project.projectStatus === 'Active' ? '#166534' : '#334155'}`,
            flexShrink: 0,
          }}>
            {project.projectStatus || 'Active'}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {project.city && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              📍 {[project.city, project.country].filter(Boolean).join(', ')}
            </div>
          )}
          {project.projectManager && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              PM: {project.projectManager}
            </div>
          )}
        </div>

        {/* Opening date */}
        {daysToOpening !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: urgencyColor + '12',
            border: `1px solid ${urgencyColor}30`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: urgencyColor, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: urgencyColor, fontWeight: 600 }}>
              {daysToOpening > 0
                ? `Opening in ${daysToOpening}d · ${project.targetOpeningDate}`
                : daysToOpening === 0
                ? 'Opening today'
                : `${Math.abs(daysToOpening)}d overdue`}
            </span>
          </div>
        )}

        {/* CTA */}
        <div style={{
          marginTop: 4,
          padding: '9px 0',
          borderRadius: 9,
          background: 'linear-gradient(135deg, #0c4a6e 0%, #0891b2 100%)',
          color: '#f0f9ff',
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}>
          Start Site Visit →
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
          {/* Active projects */}
          {activeProjects.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 14 }}>
                Active Projects — {activeProjects.length}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {activeProjects.map(p => <ProjectCard key={p.id} project={p} />)}
              </div>
            </div>
          )}

          {/* Completed projects */}
          {completedProjects.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 14 }}>
                Completed Projects — {completedProjects.length}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {completedProjects.map(p => <ProjectCard key={p.id} project={p} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SiteVisitSelect;
