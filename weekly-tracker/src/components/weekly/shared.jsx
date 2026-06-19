import { WP_STATUS_SCORES } from '../../config/workPackages';

const SCHED_COLOR = {
  'On Track': 'var(--status-done)',
  'Critical': 'var(--status-alert)',
  'Delayed':  'var(--status-alert)',
  'At Risk':  'var(--status-warn)',
};

export function StatusBadge({ value }) {
  if (!value || value === '-') return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const scheduleColor = SCHED_COLOR[value] || null;
  const score = WP_STATUS_SCORES[value] ?? null;
  const color = scheduleColor ?? (
    score >= 1   ? 'var(--status-done)'  :
    score >= 0.5 ? 'var(--status-warn)'  :
    score > 0    ? 'var(--accent)'       :
                   'var(--text-muted)'
  );
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--accent-subtle)', color, border: '1px solid var(--border)' }}>
      {value}
    </span>
  );
}

export function InfoLabel({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{children || '—'}</div>
    </div>
  );
}

export function TextBlock({ label, value, plain = false }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65 }}>
        {plain
          ? <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
          : <Linkified text={value} />}
      </div>
    </div>
  );
}

function Linkified({ text }) {
  const URL_RE = /https?:\/\/[^\s]+/g;
  const segments = [];
  let last = 0;
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) segments.push(text.slice(last, m.index));
    segments.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--border)', textDecoration: 'none' }}>
        Link ↗
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push(text.slice(last));
  if (segments.length === 1 && typeof segments[0] === 'string') {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{segments[0]}</span>;
  }
  return <>{segments}</>;
}
