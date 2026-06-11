// Shared React micro-components for the Weekly Reports feature.
// Pure utility functions live in ./sharedUtils.js
import { WP_STATUS_SCORES } from '../../config/workPackages';

export function StatusBadge({ value }) {
  if (!value || value === '-') return <span style={{ color: '#9ca3af' }}>—</span>;
  const scheduleColor = value === 'On Track' ? '#22c55e' : value === 'Critical' ? '#dc2626' : value === 'Delayed' ? '#ef4444' : value === 'At Risk' ? '#f59e0b' : null;
  const score = WP_STATUS_SCORES[value] ?? null;
  const color = scheduleColor ?? (score >= 1 ? '#22c55e' : score >= 0.5 ? '#f59e0b' : score > 0 ? '#60a5fa' : '#94a3b8');
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: color + '20', color, border: `1px solid ${color}44` }}>
      {value}
    </span>
  );
}

export function InfoLabel({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{children || '—'}</div>
    </div>
  );
}

export function TextBlock({ label, value, plain = false }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 8 }}>{label}</div>
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: '#374151', lineHeight: 1.65 }}>
        {plain
          ? <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
          : <Linkified text={value} />}
      </div>
    </div>
  );
}

// Renders text with URLs replaced by styled link chips.
function Linkified({ text }) {
  const URL_RE = /https?:\/\/[^\s]+/g;
  const segments = [];
  let last = 0;
  let m;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) segments.push(text.slice(last, m.index));
    segments.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', textDecoration: 'none' }}>
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
