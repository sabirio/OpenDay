import { useNavigate } from 'react-router-dom';
import { daysUntil } from '../../utils/reportUtils';
import { getOpeningUrgencyColor } from '../../config/statusColors';
import { daysOverdueCount } from '../../hooks/useOpeningReadinessPresentation';

// Generic "select a project to enter a field workflow" row/list, extracted
// from Site Visit's project selector so Field Snag List (and any future
// field entry point) gets the same visual language and interaction without
// duplicating this markup. Business logic (which projects are visible) is
// the caller's responsibility — this component only renders what it's given.
function ProjectSelectRow({ project, buildHref, ctaLabel, ariaLabelPrefix }) {
  const navigate = useNavigate();
  const daysToOpening = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const urgencyColor = getOpeningUrgencyColor(daysToOpening);

  const openingLabel =
    daysToOpening === null  ? null
    : daysToOpening < 0    ? `${daysOverdueCount(daysToOpening)}d overdue`
    : daysToOpening === 0  ? 'Opening today'
    : `${daysToOpening}d · ${project.targetOpeningDate}`;

  const statusChip = project.projectStatus === 'Active'
    ? { bg: 'var(--status-done-bg)', color: 'var(--status-done)', border: 'var(--border)' }
    : { bg: 'var(--bg-elevated)',    color: 'var(--text-muted)',  border: 'var(--border)' };

  return (
    <button
      type="button"
      className="site-visit-select-row"
      onClick={() => navigate(buildHref(project))}
      aria-label={`${ariaLabelPrefix} ${project.storeCode || project.shoppingMallName || 'project'}`}
      style={{
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-subtle)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Store + Mall */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {project.storeCode || '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {project.shoppingMallName || '—'}
          {project.city && <span style={{ marginLeft: 6 }}>· {[project.city, project.country].filter(Boolean).join(', ')}</span>}
        </div>
      </div>

      {/* PM + opening */}
      <div style={{ minWidth: 0 }}>
        {project.projectManager && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{project.projectManager}</div>
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
          background: statusChip.bg, color: statusChip.color, border: `1px solid ${statusChip.border}`,
        }}>
          {project.projectStatus || 'Active'}
        </span>
      </div>

      {/* CTA — visual only; the row itself (role="button" above) is the single
          interactive control, so this isn't a real nested <button>. */}
      <span
        aria-hidden="true"
        className="site-visit-select-cta"
        style={{
          padding: '7px 18px',
          borderRadius: 8,
          background: 'var(--status-warn)',
          color: 'var(--text-inverse)',
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {ctaLabel}
      </span>
    </button>
  );
}

function ProjectSelectGroup({ title, rows, buildHref, ctaLabel, ariaLabelPrefix }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
        {title} — {rows.length}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        {/* Table header — hidden below 640px, where rows stack as cards
            (a 4-column header doesn't map onto a stacked layout). */}
        <div className="site-visit-select-header" style={{
          padding: '8px 18px',
          background: 'var(--accent-subtle)',
          borderBottom: '1px solid var(--border)',
        }}>
          {['Project', 'PM / Opening', 'Status', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{h}</div>
          ))}
        </div>
        {/* Rows */}
        <div>
          {rows.map((p) => (
            <ProjectSelectRow key={p.id} project={p} buildHref={buildHref} ctaLabel={ctaLabel} ariaLabelPrefix={ariaLabelPrefix} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProjectSelectList({ projects, buildHref, ctaLabel, ariaLabelPrefix }) {
  const activeProjects    = projects.filter(p => p.projectStatus !== 'Completed');
  const completedProjects = projects.filter(p => p.projectStatus === 'Completed');
  return (
    <>
      <ProjectSelectGroup title="Active Projects"    rows={activeProjects}    buildHref={buildHref} ctaLabel={ctaLabel} ariaLabelPrefix={ariaLabelPrefix} />
      <ProjectSelectGroup title="Completed Projects" rows={completedProjects} buildHref={buildHref} ctaLabel={ctaLabel} ariaLabelPrefix={ariaLabelPrefix} />
    </>
  );
}
