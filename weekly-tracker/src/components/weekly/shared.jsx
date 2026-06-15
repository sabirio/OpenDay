import { WP_STATUS_SCORES } from '../../config/workPackages';

export function StatusBadge({ value }) {
  if (!value || value === '-') return <span style={{ color: '#9ca3af' }}>—</span>;
  const scheduleColor = value === 'On Track' ? '#10b981' : value === 'Critical' ? '#ef4444' : value === 'Delayed' ? '#ef4444' : value === 'At Risk' ? '#f97316' : null;
  const score = WP_STATUS_SCORES[value] ?? null;
  const color = scheduleColor ?? (score >= 1 ? '#10b981' : score >= 0.5 ? '#f97316' : score > 0 ? '#22d3ee' : '#9ca3af');
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: color + '22', color, border: `1px solid ${color}44` }}>
      {value}
    </span>
  );
}

export function InfoLabel({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 500 }}>{children || '—'}</div>
    </div>
  );
}

export function TextBlock({ label, value, plain = false }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 8 }}>{label}</div>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: '#e5e7eb', lineHeight: 1.65 }}>
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
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#164e63', color: '#67e8f9', border: '1px solid #0e7490', textDecoration: 'none' }}>
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
