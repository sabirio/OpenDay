// Project name + one-line metadata strip: Store · Country · PM · Type · Status
export default function ProjectHeader({ project }) {
  if (!project) return null;

  const STATUS_COLORS = {
    Active:    { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    Completed: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    OnHold:    { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  };
  const sc = STATUS_COLORS[project.projectStatus] ?? { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };

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
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.3 }}>
          {project.shoppingMallName || project.storeCode || '—'}
        </h2>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {meta.map((part, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: '#d1d5db' }}>·</span>}
              {part}
            </span>
          ))}
        </div>
      </div>
      {project.projectStatus && (
        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, ...sc, border: `1px solid ${sc.border}` }}>
          {project.projectStatus}
        </span>
      )}
    </div>
  );
}
