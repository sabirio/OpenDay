import { schedStatusToTone } from '../../config/statusColors';
import { minOf, maxOf, spanOrOne, scaleToRange, valueToSparkY, labelStep } from '../../hooks/useChartMathPresentation';
import StatusBadge from '../shared/StatusBadge.jsx';

const T = {
  bgSurface:  'var(--bg-surface)',
  bgPage:     'var(--bg-base)',
  border:     'var(--border)',
  textMuted:  'var(--text-muted)',
  textSec:    'var(--text-secondary)',
  textBody:   'var(--text-primary)',
  textPrimary:'var(--text-primary)',
  shadow:     'var(--shadow)',
};

export function KpiCard({ label, value, sub, color = 'var(--accent)' }) {
  return (
    <div data-testid="kpi-card" style={{
      background: T.bgSurface,
      borderRadius: 12,
      padding: '12px 14px',
      flex: 1,
      minWidth: 100,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, minHeight: 32, display: 'flex', alignItems: 'center' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function LineChart({ points = [], width = 480, height = 120, color = 'var(--accent)' }) {
  const valid = points.filter(p => p.date && !isNaN(new Date(p.date)));
  if (valid.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: 13 }}>
      Not enough data
    </div>
  );
  const pad = { top: 10, right: 14, bottom: 28, left: 34 };
  const W = width - pad.left - pad.right, H = height - pad.top - pad.bottom;
  const xs = valid.map(p => new Date(p.date).getTime());
  const minX = minOf(xs), maxX = maxOf(xs);
  const rangeX = spanOrOne(minX, maxX);
  const sx = x => pad.left + scaleToRange(x, minX, rangeX, W);
  const sy = y => pad.top + valueToSparkY(y, 0, 100, H);
  const poly = valid.map(p => `${sx(new Date(p.date).getTime())},${sy(p.value)}`).join(' ');
  const yT = [0, 50, 100];
  const step = labelStep(valid.length);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {yT.map(v => <line key={v} x1={pad.left} y1={sy(v)} x2={pad.left + W} y2={sy(v)} stroke={T.border} strokeWidth={0.5} />)}
      {yT.map(v => <text key={v} x={pad.left - 5} y={sy(v) + 4} textAnchor="end" fontSize={10} fill={T.textMuted}>{v}%</text>)}
      <polyline points={poly} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {valid.map((p, i) => <circle key={i} cx={sx(new Date(p.date).getTime())} cy={sy(p.value)} r={2} fill={T.bgPage} stroke={color} strokeWidth={1.5} />)}
      {valid.filter((_, i) => i % step === 0 || i === valid.length - 1).map((p, i) =>
        <text key={i} x={sx(new Date(p.date).getTime())} y={height - 4} textAnchor="middle" fontSize={10} fill={T.textMuted}>
          {new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
        </text>
      )}
    </svg>
  );
}

export function ActivityHeatmap({ projectRows, weekCount = 16 }) {
  const now = new Date();
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const s = new Date(now); s.setDate(s.getDate() - (weekCount - 1 - i) * 7); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
    return { start: s, end: e, label: s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) };
  });
  const CW = 36, CH = 28, LW = 100, G = 3;
  const STATUS_BG = {
    'On Track': 'var(--border-strong)',
    'Critical': 'var(--status-alert)',
    'Delayed':  'var(--status-alert)',
    'At Risk':  'var(--status-warn)',
  };
  const STATUS_FG = {
    'On Track': 'var(--text-primary)',
    'Critical': 'var(--color-on-fill-light)',
    'Delayed':  'var(--color-on-fill-light)',
    'At Risk':  'var(--color-on-fill-light)',
  };
  const LEGEND = [
    { color: 'var(--border)',        t: 'No report' },
    { color: 'var(--border-strong)', t: 'On Track'  },
    { color: 'var(--status-warn)',   t: 'At Risk'   },
    { color: 'var(--status-alert)',  t: 'Delayed'   },
    { color: 'var(--status-alert)',  t: 'Critical'  },
    { color: 'var(--text-secondary)',t: 'Submitted' },
  ];
  return (
    <div className="ds-data-surface">
      <div style={{ display: 'inline-block', minWidth: LW + weeks.length * (CW + G) }}>
        <div style={{ display: 'flex', marginLeft: LW, marginBottom: 5 }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ width: CW, marginRight: G, textAlign: 'center', fontSize: 8, color: T.textMuted, flexShrink: 0 }}>
              {i % 2 === 0 ? w.label : ''}
            </div>
          ))}
        </div>
        {projectRows.map(({ project, cells }) => (
          <div key={project.id} style={{ display: 'flex', alignItems: 'center', marginBottom: G }}>
            <div style={{ width: LW, fontSize: 11, fontWeight: 600, color: T.textBody, paddingRight: 8, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.storeCode}
            </div>
            {cells.map((cell, i) => {
              const bg = cell.count > 0 ? (STATUS_BG[cell.status] ?? 'var(--text-secondary)') : 'var(--border)';
              const fg = cell.count > 0 ? (STATUS_FG[cell.status] ?? 'var(--color-on-fill-light)') : 'transparent';
              return (
                <div
                  key={i}
                  title={`${weeks[i].label} · ${cell.count > 0 ? cell.count + ' report(s) · ' + (cell.status || 'submitted') : 'No report'}`}
                  style={{ width: CW, height: CH, borderRadius: 4, background: bg, marginRight: G, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: fg }}
                >
                  {cell.count > 0 ? String(cell.count) : ''}
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, marginLeft: LW, fontSize: 11, color: T.textMuted }}>
          {LEGEND.map(({ color, t }) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${T.border}` }} />
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TextBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.textMuted, marginBottom: 5 }}>{label}</div>
      <div style={{ background: 'var(--bg-surface)', border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.textBody, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  );
}

export function SchedBadge({ status }) {
  if (!status) return <StatusBadge tone="muted">—</StatusBadge>;
  return <StatusBadge tone={schedStatusToTone(status)}>{status}</StatusBadge>;
}
