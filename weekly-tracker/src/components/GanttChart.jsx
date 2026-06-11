import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { calculateLayout } from '../engines/ganttLayout.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEFT_W      = 280;
const HEADER_H    = 48;
const ROW_H       = 36;
const PHASE_ROW_H = 32;
const BAR_H       = 22;

// Phase colour palette — local to Gantt only; colour not stored in config
const PHASE_PALETTE = {
  demolition:    '#6b7280',
  floor_prep:    '#f97316',
  rough_in:      '#3b82f6',
  floor_tiling:  '#22d3ee',
  testing:       '#8b5cf6',
  wall_closing:  '#ec4899',
  finishes:      '#14b8a6',
  end_devices:   '#f59e0b',
  commissioning: '#10b981',
  pre_opening:   '#6366f1',
  handover:      '#0ea5e9',
};
function phaseColor(id) { return PHASE_PALETTE[id] || '#6b7280'; }

// NORYX light palette
const C = {
  bg:        '#ffffff',
  bgCard:    '#f9fafb',
  bgEl:      '#f9fafb',
  border:    '#e5e7eb',
  text:      '#111827',
  muted:     '#6b7280',
  blue:      '#4F8EF7',
  green:     '#22c55e',
  yellow:    '#f59e0b',
  red:       '#ef4444',
  redCrit:   '#dc2626',
  orange:    '#f97316',
  white60:   'rgba(0,0,0,0.45)',
};

function fmtDate(d) {
  if (!d) return '—';
  return (d instanceof Date ? d : new Date(d))
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Controls bar ─────────────────────────────────────────────────────────────

function Controls({ zoom, setZoom, onToday, onFitAll, showArrows, onArrowsToggle, phases, collapseState, onCollapseAll, onExpandAll }) {
  const allCollapsed = phases.length > 0 && phases.every(p => collapseState[p.id]);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '9px 14px', borderBottom: `1px solid ${C.border}`,
      background: C.bgEl, flexShrink: 0,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, marginRight: 4 }}>
        Gantt Chart
      </span>

      {/* Zoom toggle */}
      <div style={{
        display: 'flex', gap: 2, background: C.bg,
        borderRadius: 7, padding: 2, border: `1px solid ${C.border}`,
      }}>
        {['week', 'month', 'quarter'].map(z => (
          <button key={z} onClick={() => setZoom(z)} style={{
            padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.12s',
            background: zoom === z ? C.blue : 'transparent',
            color:      zoom === z ? '#fff' : C.muted,
          }}>
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
      </div>

      {/* Today / Fit All */}
      <button onClick={onToday} style={btnStyle}>Today</button>
      <button onClick={onFitAll} style={btnStyle}>Fit All</button>

      {/* Arrows toggle */}
      <button onClick={onArrowsToggle} style={{
        ...btnStyle,
        borderColor: showArrows ? C.blue : C.border,
        color:       showArrows ? C.blue : C.muted,
        background:  showArrows ? 'rgba(79,142,247,0.1)' : 'transparent',
      }}>
        Arrows ↗
      </button>

      {/* Collapse/Expand */}
      <button onClick={allCollapsed ? onExpandAll : onCollapseAll} style={btnStyle}>
        {allCollapsed ? 'Expand All' : 'Collapse All'}
      </button>
    </div>
  );
}

const btnStyle = {
  padding: '4px 12px', borderRadius: 7, cursor: 'pointer',
  border: `1px solid ${C.border}`, background: 'transparent',
  color: C.muted, fontSize: 12, fontWeight: 500, transition: 'all 0.12s',
};

// ─── WP Detail tooltip (click-based, fixed position) ─────────────────────────

function WPTooltip({ task, onClose }) {
  if (!task) return null;
  const disc = task.discrepancy;

  const badge = (label, color, bg) => (
    <span style={{
      padding: '1px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700,
      color, background: bg,
    }}>{label}</span>
  );

  return (
    <div style={{
      position: 'fixed', top: 90, right: 24, width: 268, zIndex: 200,
      background: C.bgCard, border: `1.5px solid ${C.border}`,
      borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
      overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 14px 10px', background: C.bgEl,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
          {task.label || task.name || task.id}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.muted, fontSize: 18, lineHeight: 1, padding: 0,
        }}>×</button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
        <Row label="Phase"    value={task.phaseLabel} />
        <Row label="Planned"  value={`${fmtDate(task.earlyStart)} → ${fmtDate(task.earlyFinish)}`} />
        <Row label="Duration" value={`${task.duration_days}d`} />
        <Row label="Progress" value={`${task.actual_progress ?? 0}%`} bold />
        {task.actual_start && <Row label="Started" value={fmtDate(task.actual_start)} />}

        {disc && disc.status !== 'ok' && (
          <>
            <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
            <Row label="Contractor"  value={`${disc.contractor_progress ?? 0}%`} />
            <Row label="PM Observed" value={`${disc.site_visit_progress ?? 0}%`} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.muted }}>Discrepancy</span>
              {disc.status === 'critical'
                ? badge(`CRITICAL (${disc.delta?.toFixed(1)}%)`, '#fff', C.red)
                : badge(`WARNING (${disc.delta?.toFixed(1)}%)`, '#000', C.yellow)}
            </div>
            {disc.site_visit_date && <Row label="Visited" value={fmtDate(disc.site_visit_date)} />}
          </>
        )}

        <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
        <Row label="Is Blocker"    value={task.isBlocker  ? 'YES' : 'No'} critical={task.isBlocker} />
        <Row label="Critical Path" value={task.isCritical ? 'YES' : 'No'} critical={task.isCritical} />
        <Row label="Float"         value={`${task.float_days ?? 0}d`} />
      </div>
    </div>
  );
}

function Row({ label, value, bold, critical }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: critical ? C.redCrit : C.text,
        fontWeight: (bold || critical) ? 700 : 500,
        textAlign: 'right',
      }}>{value}</span>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const bars = [
    { label: 'Planned',       bg: '#e5e7eb',                  border: C.border },
    { label: 'In Progress',   bg: C.blue,                     border: 'none' },
    { label: 'Complete',      bg: C.green,                    border: 'none' },
    { label: 'Critical Path', bg: 'rgba(255,100,100,0.4)',    border: C.redCrit },
    { label: 'Warning ⚠',    bg: 'rgba(245,158,11,0.2)',     border: C.yellow },
    { label: 'Critical Disc', bg: 'rgba(239,68,68,0.2)',      border: C.red },
  ];
  const lines = [
    { label: 'Today',         color: C.white60, dashed: true },
    { label: 'Target Open',   color: C.green,   dashed: false },
    { label: 'Const. Done',   color: C.blue,    dashed: false },
    { label: 'Forecast Open', color: C.yellow,  dashed: true },
  ];

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
      padding: '8px 14px', borderTop: `1px solid ${C.border}`,
      background: C.bgEl, flexShrink: 0,
    }}>
      {bars.map(({ label, bg, border }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
          <div style={{
            width: 18, height: 9, borderRadius: 3, flexShrink: 0,
            background: bg, border: border !== 'none' ? `1.5px solid ${border}` : 'none',
          }} />
          <span>{label}</span>
        </div>
      ))}
      {lines.map(({ label, color, dashed }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
          <div style={{
            width: 18, height: 0, flexShrink: 0,
            borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── SVG bar per WP ───────────────────────────────────────────────────────────

function WPBar({ task, isSelected, onClick }) {
  const { x, barY, width, barHeight, isCritical, isBlocker,
          status, actual_progress, discrepancy } = task;

  const prog     = Math.max(0, Math.min(100, actual_progress ?? 0));
  const complete = status === 'completed' || prog >= 100;
  const notStarted = !complete && prog === 0;

  // Colors
  let bgFill, progFill, strokeColor, strokeWidth, strokeDash;

  if (complete) {
    bgFill     = `${C.green}33`;
    progFill   = C.green;
    strokeColor = `${C.green}88`;
    strokeWidth = 1;
    strokeDash  = 'none';
  } else if (isCritical) {
    bgFill     = '#fef2f2';
    progFill   = '#ef4444';
    strokeColor = C.redCrit;
    strokeWidth = 1.5;
    strokeDash  = 'none';
  } else {
    bgFill     = notStarted ? '#f3f4f6' : '#e5e7eb';
    progFill   = C.blue;
    strokeColor = C.border;
    strokeWidth = 1;
    strokeDash  = 'none';
  }

  // Discrepancy overrides border
  if (discrepancy?.status === 'warning') {
    strokeColor = C.yellow;
    strokeWidth = 1.5;
  }
  if (discrepancy?.status === 'critical') {
    strokeColor = C.red;
    strokeWidth = 2;
  }

  // Selected highlight
  if (isSelected) {
    strokeColor = C.blue;
    strokeWidth = 2.5;
  }

  const progW  = Math.max(0, (prog / 100) * width);
  const barMid = barY + barHeight / 2;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Critical path glow */}
      {isCritical && (
        <rect
          x={x - 2} y={barY - 2}
          width={Math.max(2, width) + 4} height={barHeight + 4}
          rx={6} fill="none"
          stroke={C.redCrit} strokeWidth={1.5} opacity={0.3}
          filter="url(#gantt-glow)"
        />
      )}

      {/* Bar background */}
      <rect
        x={x} y={barY}
        width={Math.max(2, width)} height={barHeight}
        rx={4} fill={bgFill}
        stroke={strokeColor} strokeWidth={strokeWidth}
        strokeDasharray={strokeDash}
      />

      {/* Progress fill */}
      {progW > 0 && (
        <rect
          x={x} y={barY}
          width={progW} height={barHeight}
          rx={4} fill={progFill}
          opacity={complete ? 0.95 : 0.9}
          clipPath={`inset(0 0 0 0 round 4px)`}
        />
      )}

      {/* Bar label (only if wide enough) */}
      {width > 70 && (
        <text
          x={x + width / 2} y={barMid + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fill="#fff" fontWeight={600}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          opacity={0.85}
        >
          {complete ? `✓ ${prog}%` : `${prog}%`}
        </text>
      )}

      {/* Blocker lock */}
      {isBlocker && (
        <text x={x - 14} y={barMid + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={10} style={{ pointerEvents: 'none' }}>
          🔒
        </text>
      )}

      {/* Discrepancy badges */}
      {discrepancy?.status === 'warning' && (
        <g>
          <circle cx={x + width - 7} cy={barY + 6} r={6} fill={C.yellow} />
          <text x={x + width - 7} y={barY + 7}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fill="#000" fontWeight={800}
            style={{ pointerEvents: 'none' }}>⚠</text>
        </g>
      )}
      {discrepancy?.status === 'critical' && (
        <g>
          <circle cx={x + width - 7} cy={barY + 6} r={6} fill={C.red} />
          <text x={x + width - 7} y={barY + 7}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#fff" fontWeight={800}
            style={{ pointerEvents: 'none' }}>!</text>
        </g>
      )}

      {/* Delayed forecast: dashed red right extension */}
      {status === 'delayed' && (
        <rect
          x={x + width} y={barY}
          width={Math.max(12, width * 0.15)} height={barHeight}
          rx={0} fill="none"
          stroke={C.red} strokeWidth={1.5} strokeDasharray="4,2" opacity={0.7}
        />
      )}
    </g>
  );
}

// ─── Key date line ─────────────────────────────────────────────────────────────

function KeyDateLine({ kd, height }) {
  const dash = kd.style === 'dashed' ? '8,4' : 'none';
  const isForecastDelayed = kd.type === 'forecast_opening' && kd.color === C.red;
  const label = isForecastDelayed ? 'DELAYED FORECAST' : kd.label.toUpperCase();

  return (
    <g>
      <line
        x1={kd.x} y1={0} x2={kd.x} y2={height}
        stroke={kd.color}
        strokeWidth={kd.style === 'dashed' ? 1.5 : 2}
        strokeDasharray={dash}
        opacity={0.9}
      />
      {/* Diamond marker */}
      <polygon
        points={`${kd.x},4 ${kd.x + 5},11 ${kd.x},18 ${kd.x - 5},11`}
        fill={kd.color}
        opacity={0.9}
      />
      {/* Label */}
      <text
        x={kd.x + 6} y={7}
        fontSize={9} fill={kd.color} fontWeight={700}
        style={{ userSelect: 'none' }}
        opacity={0.9}
      >
        {label}
      </text>
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GanttChart({
  project,
  tasks: tasksProp,
  ganttData,           // legacy alias
  layout: layoutProp,
  keyDates = {},
  discrepancies = [],
  onWPClick,
  defaultZoom = 'month',
  readOnly = false,
}) {
  const tasks = tasksProp || ganttData || [];

  const [zoom,         setZoom]         = useState(defaultZoom);
  const [showArrows,   setShowArrows]   = useState(true);
  const [collapseState, setCollapseState] = useState({});
  const [selectedTask, setSelectedTask]  = useState(null);
  const [containerW,   setContainerW]    = useState(900);

  const containerRef = useRef(null);
  const rightRef     = useRef(null);

  // Measure chart pane width
  useEffect(() => {
    if (!rightRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      setContainerW(Math.max(600, e.contentRect.width));
    });
    obs.observe(rightRef.current);
    return () => obs.disconnect();
  }, []);

  // Build layout
  const layout = useMemo(() => {
    if (layoutProp) return layoutProp;
    if (!tasks.length) return null;
    return calculateLayout(tasks, zoom, containerW, keyDates, discrepancies, collapseState);
  }, [layoutProp, tasks, zoom, containerW, keyDates, discrepancies, collapseState]);

  // Scroll to today on mount / zoom change
  useEffect(() => {
    if (!layout || !rightRef.current) return;
    const today = layout.keyDateLines.find(l => l.type === 'today');
    if (today) {
      rightRef.current.scrollLeft = Math.max(0, today.x - containerW / 3);
    }
  }, [layout?.chartWidth, zoom]);

  const scrollToToday = useCallback(() => {
    if (!layout || !rightRef.current) return;
    const today = layout.keyDateLines.find(l => l.type === 'today');
    if (today) rightRef.current.scrollLeft = Math.max(0, today.x - containerW / 3);
  }, [layout, containerW]);

  const fitAll = useCallback(() => {
    if (rightRef.current) rightRef.current.scrollLeft = 0;
  }, []);

  const togglePhase  = useCallback(id => setCollapseState(p => ({ ...p, [id]: !p[id] })), []);
  const collapseAll  = useCallback(() => {
    const s = {};
    for (const p of (layout?.phases || [])) s[p.id] = true;
    setCollapseState(s);
  }, [layout]);
  const expandAll    = useCallback(() => setCollapseState({}), []);

  const handleBarClick = useCallback((task) => {
    setSelectedTask(prev => prev?.id === task.id ? null : task);
    onWPClick?.(task.id);
  }, [onWPClick]);

  // ── Empty / loading ──────────────────────────────────────────────────────────
  if (!tasks.length) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: 240, background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
        color: C.muted, gap: 8, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 36 }}>📊</div>
        <div style={{ fontSize: 14 }}>No schedule data</div>
        <div style={{ fontSize: 12 }}>Build the project schedule to view the Gantt chart.</div>
      </div>
    );
  }
  if (!layout) return null;

  const { phases, tasks: layoutTasks, arrows, timelineHeaders, keyDateLines, chartWidth, totalHeight } = layout;

  // ── Left panel rows ──────────────────────────────────────────────────────────
  const leftRows = [];
  for (const phase of phases) {
    const isCollapsed = !!collapseState[phase.id];
    leftRows.push(
      <div key={`ph-${phase.id}`}
        onClick={() => togglePhase(phase.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: PHASE_ROW_H, padding: '0 10px',
          cursor: 'pointer', background: C.bgCard,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          userSelect: 'none',
        }}>
        <span style={{ fontSize: 9, color: C.muted, width: 14, flexShrink: 0 }}>
          {isCollapsed ? '▶' : '▼'}
        </span>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: phaseColor(phase.id), flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontWeight: 700, color: C.text, textTransform: 'uppercase',
          letterSpacing: '0.04em', flex: 1,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {phase.label}
        </span>
        <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
          {phase.wps?.length || 0}
        </span>
      </div>
    );

    if (!isCollapsed) {
      for (const wp of (phase.wps || [])) {
        const t    = layoutTasks.find(lt => lt.id === wp.id);
        const prog = t?.actual_progress ?? 0;
        const disc = t?.discrepancy;
        leftRows.push(
          <div key={`wp-${wp.id}`}
            onClick={() => !readOnly && handleBarClick(t || wp)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: ROW_H, padding: '0 10px 0 24px',
              cursor: readOnly ? 'default' : 'pointer',
              borderBottom: `1px solid ${C.border}22`,
              borderLeft: `3px solid ${
                selectedTask?.id === wp.id ? C.blue
                : t?.isCritical ? `${C.redCrit}88`
                : disc?.status === 'critical' ? C.red
                : disc?.status === 'warning'  ? C.yellow
                : 'transparent'
              }`,
              background: selectedTask?.id === wp.id ? 'rgba(79,142,247,0.07)' : 'transparent',
              flexShrink: 0,
            }}>
            {t?.isBlocker && <span style={{ fontSize: 9, flexShrink: 0 }}>🔒</span>}
            <span style={{
              fontSize: 12, color: C.text, flex: 1,
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }} title={wp.label || wp.id}>
              {wp.label || wp.id}
            </span>
            <div style={{
              width: 36, height: 4, background: C.border,
              borderRadius: 2, overflow: 'hidden', flexShrink: 0,
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(100, prog)}%`,
                background: prog >= 100 ? C.green : prog > 0 ? C.blue : C.muted,
              }} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, flexShrink: 0, width: 30, textAlign: 'right',
              color: prog >= 100 ? C.green : prog > 0 ? C.yellow : C.muted,
            }}>
              {prog}%
            </span>
          </div>
        );
      }
    }
  }

  // ── Timeline header SVG ──────────────────────────────────────────────────────
  const tlHeader = (
    <svg width={chartWidth} height={HEADER_H} style={{ display: 'block', flexShrink: 0 }}>
      <rect width={chartWidth} height={HEADER_H} fill={C.bg} />
      <line x1={0} y1={HEADER_H - 1} x2={chartWidth} y2={HEADER_H - 1} stroke={C.border} />
      {timelineHeaders.map((h, i) => (
        <g key={i}>
          <line x1={h.x} y1={0} x2={h.x} y2={HEADER_H} stroke={C.border} strokeWidth={0.5} opacity={0.5} />
          <text
            x={h.x + h.width / 2} y={HEADER_H / 2 + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill={C.muted} fontWeight={600}
            style={{ userSelect: 'none' }}
          >
            {h.label}
          </text>
        </g>
      ))}
    </svg>
  );

  // ── Grid alternating stripes ─────────────────────────────────────────────────
  const stripes = timelineHeaders.map((h, i) => (
    <rect key={`s-${i}`} x={h.x} y={0} width={h.width} height={totalHeight}
      fill={i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent'} />
  ));

  // ── Row separator lines ──────────────────────────────────────────────────────
  const rowLines = layoutTasks.map(t => (
    <line key={`rl-${t.id}`} x1={0} y1={t.y + ROW_H} x2={chartWidth} y2={t.y + ROW_H}
      stroke={C.border} strokeWidth={0.4} opacity={0.4} />
  ));

  // ── Phase header bands ───────────────────────────────────────────────────────
  const phaseBands = phases.map(phase => {
    const isCollapsed = !!collapseState[phase.id];

    if (isCollapsed) {
      // Collapsed: show summary bar across the phase row
      const pTasks = layoutTasks.filter(t => t.phaseId === phase.id);
      if (!pTasks.length) return null;
      const minX = Math.min(...pTasks.map(t => t.x));
      const maxX = Math.max(...pTasks.map(t => t.x + t.width));
      const avg  = Math.round(pTasks.reduce((s, t) => s + (t.actual_progress ?? 0), 0) / pTasks.length);
      const bY   = phase.y + (PHASE_ROW_H - BAR_H) / 2;
      const w    = Math.max(4, maxX - minX);
      return (
        <g key={`phbar-${phase.id}`}>
          <rect x={minX} y={bY} width={w} height={BAR_H} rx={4} fill={`${phaseColor(phase.id)}44`} />
          <rect x={minX} y={bY} width={w * avg / 100} height={BAR_H} rx={4} fill={phaseColor(phase.id)} opacity={0.85} />
          {w > 60 && (
            <text x={minX + w / 2} y={bY + BAR_H / 2 + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fill="#fff" fontWeight={600}>
              {phase.label} — {avg}%
            </text>
          )}
        </g>
      );
    }

    // Expanded: left accent bar + background stripe
    return (
      <g key={`phbg-${phase.id}`}>
        <rect x={0} y={phase.y} width={chartWidth} height={PHASE_ROW_H}
          fill={C.bgCard} />
        <rect x={0} y={phase.y + PHASE_ROW_H} width={3} height={phase.height - PHASE_ROW_H}
          fill={phaseColor(phase.id)} opacity={0.7} />
      </g>
    );
  });

  // ── Dependency arrows ────────────────────────────────────────────────────────
  const arrowEls = (showArrows && zoom !== 'quarter') ? arrows.map((a, i) => (
    <path key={`a-${i}`}
      d={a.path} fill="none"
      stroke={a.isCritical ? C.redCrit : C.blue}
      strokeWidth={1.5}
      opacity={0.35}
      markerEnd={a.isCritical ? 'url(#gantt-ah-crit)' : 'url(#gantt-ah)'}
    />
  )) : [];

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column',
      background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
      overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
    }}>
      {/* Controls */}
      <Controls
        zoom={zoom} setZoom={setZoom}
        onToday={scrollToToday} onFitAll={fitAll}
        showArrows={showArrows} onArrowsToggle={() => setShowArrows(v => !v)}
        phases={phases} collapseState={collapseState}
        onCollapseAll={collapseAll} onExpandAll={expandAll}
      />

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 200 }}>

        {/* Left panel */}
        <div style={{
          width: LEFT_W, flexShrink: 0, borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: C.bgEl,
        }}>
          {/* Spacer aligns with timeline header */}
          <div style={{ height: HEADER_H, borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.bg }} />
          {/* Scrollable rows */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin' }}>
            {leftRows}
          </div>
        </div>

        {/* Chart area */}
        <div ref={rightRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Sticky timeline header */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
            {tlHeader}
          </div>

          {/* Main SVG */}
          <svg
            width={chartWidth}
            height={totalHeight}
            style={{ display: 'block', background: C.bg, flexShrink: 0 }}
          >
            <defs>
              <filter id="gantt-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <marker id="gantt-ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 Z" fill={C.blue} opacity="0.6" />
              </marker>
              <marker id="gantt-ah-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 Z" fill={C.redCrit} opacity="0.6" />
              </marker>
            </defs>

            {/* Grid */}
            {stripes}
            {rowLines}

            {/* Phase bands / collapsed bars */}
            {phaseBands}

            {/* Arrows (below bars) */}
            {arrowEls}

            {/* WP bars */}
            {layoutTasks.map(t => (
              <WPBar
                key={t.id}
                task={t}
                isSelected={selectedTask?.id === t.id}
                onClick={() => !readOnly && handleBarClick(t)}
              />
            ))}

            {/* Key date lines (on top) */}
            {keyDateLines.map((kd, i) => (
              <KeyDateLine key={`kd-${i}`} kd={kd} height={totalHeight} />
            ))}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <Legend />

      {/* WP Detail Tooltip */}
      {selectedTask && (
        <WPTooltip task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}
