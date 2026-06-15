export default function ProjectHeader({ project }) {
  if (!project) return null;

  const STATUS_COLORS = {
    Active:    { bg: '#064e3b', color: '#6ee7b7', border: '#065f46' },
    Completed: { bg: '#164e63', color: '#67e8f9', border: '#0e7490' },
    OnHold:    { bg: '#7c2d12', color: '#fdba74', border: '#92400e' },
  };
  const sc = STATUS_COLORS[project.projectStatus] ?? { bg: '#374151', color: '#9ca3af', border: '#4b5563' };

  const meta = [
    project.storeCode && `Store ${project.storeCode}`,
    project.country,
    project.city,
    project.projectManager && `PM: ${project.projectManager}`,
    project.projectType,
  ].filter(Boolean);

  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f9fafb', margin: 0, lineHeight: 1.3 }}>
          {project.shoppingMallName || project.storeCode || '—'}
        </h2>
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {meta.map((part, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: '#4b5563' }}>·</span>}
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
