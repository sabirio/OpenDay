const STATUS_COLORS = {
  Active:    { bg: 'var(--status-done-bg)',  color: 'var(--status-done)',  border: 'var(--border)' },
  Completed: { bg: 'var(--accent-subtle)',   color: 'var(--accent)',       border: 'var(--border)' },
  OnHold:    { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn)',  border: 'var(--border)' },
};
const SC_FALLBACK = { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', border: 'var(--border)' };

export default function ProjectHeader({ project }) {
  if (!project) return null;

  const sc = STATUS_COLORS[project.projectStatus] ?? SC_FALLBACK;

  const meta = [
    project.storeCode && `Store ${project.storeCode}`,
    project.country,
    project.city,
    project.projectManager && `PM: ${project.projectManager}`,
    project.projectType,
  ].filter(Boolean);

  return (
    <div className="weekly-project-header">
      <div>
        <div className="weekly-section-kicker">Selected project</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
          {project.shoppingMallName || project.storeCode || '—'}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {meta.map((part, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: 'var(--border-strong)' }}>·</span>}
              {part}
            </span>
          ))}
        </div>
      </div>
      {project.projectStatus && (
        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
          {project.projectStatus}
        </span>
      )}
    </div>
  );
}
