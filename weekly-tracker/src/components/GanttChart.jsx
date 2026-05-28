import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { calculateLayout } from '../engines/ganttLayout';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEFT_W     = 280;
const ROW_H      = 36;
const PHASE_ROW_H = 32;
const BAR_H      = 22;
const HEADER_H   = 28;
const LABEL_PAD  = 12;

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Controls({ viewMode, onViewModeChange, showArrows, onShowArrowsToggle, collapseState, phases, onCollapseAll, onExpandAll }) {
  const allCollapsed = phases.every(p => collapseState[p.id]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #334155', background: '#1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginRight: 4 }}>Gantt Chart</span>
      <div style={{ display: 'flex', gap: 2, background: '#0f172a', borderRadius: 7, padding: 2 }}>
        {['month','week','day'].map(m => (
          <button key={m} onClick={() => onViewModeChange(m)}
            style={{ padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: viewMode === m ? '#3b82f6' : 'transparent',
              color: viewMode === m ? '#fff' : '#94a3b8' }}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <button onClick={onShowArrowsToggle}
        style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${showArrows ? '#3b82f6' : '#334155'}`, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: showArrows ? '#1e3a5f' : 'transparent', color: showArrows ? '#93c5fd' : '#64748b' }}>
        Arrows ↗
      </button>
      <button onClick={allCollapsed ? onExpandAll : onCollapseAll}
        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #334155', cursor: 'pointer', fontSize: 12, background: 'transparent', color: '#64748b' }}>
        {allCollapsed ? 'Expand All' : 'Collapse All'}
      </button>
    </div>
  );
}

function Tooltip({ tooltip, containerRect }) {
  if (!tooltip) return null;
  const wp = tooltip.wp;
  const disc = wp.discrepancy;
  const left = Math.min(tooltip.clientX + 14, (containerRect?.width || 900) - 295);
  const top  = tooltip.clientY - (containerRect?.top || 0) + 12;

  return (
    <div style={{
      position: 'absolute', left, top, zIndex: 50,
      background: '#1e293b', border: '1px solid #475569', borderRadius: 8,
      padding: '10px 14px', width: 280, fontSize: 12, color: '#e2e8f0',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)', lineHeight: 1.6, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9', marginBottom: 6 }}>{wp.label}</div>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>Phase: {wp.phaseLabel}</div>
      <div>Planned: {fmtDate(wp.earlyStart)} → {fmtDate(wp.earlyFinish)}</div>
      <div>Duration: {wp.duration_days}d · Float: {wp.float_days}d</div>
      <div>Progress: <strong style={{ color: '#f1f5f9' }}>{wp.actual_progress}%</strong></div>
      {wp.status === 'delayed' && (
        <div style={{ color: '#f97316', marginTop: 4 }}>⚠️ Status: Delayed</div>
      )}
      {wp.isCritical && (
        <div style={{ color: '#ef4444', marginTop: 2 }}>🔴 On Critical Path</div>
      )}
      {disc && disc.status !== 'ok' && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #334155' }}>
          <div style={{ color: disc.status === 'critical' ? '#ef4444' : '#eab308', fontWeight: 600 }}>
            {disc.status === 'critical' ? '🔴' : '⚠️'} Site Visit Discrepancy
          </div>
          <div>Contractor: {disc.contractor_progress}%</div>
          <div>Site Visit: {disc.site_visit_progress}% · Δ {disc.delta}%</div>
          {disc.site_visit_date && <div style={{ color: '#94a3b8' }}>Visited: {fmtDate(disc.site_visit_date)}</div>}
          {disc.note && <div style={{ color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>PM: {disc.note}</div>}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 20, padding: '8px 14px', borderTop: '1px solid #334155', background: '#0f172a', flexWrap: 'wrap', fontSize: 11, color: '#64748b', flexShrink: 0 }}>
      <span style={{ color: '#ef4444' }}>🔴 Critical Path</span>
      <span>⬛ Blocker</span>
      <span style={{ color: '#eab308' }}>━━ Warning (SV)</span>
      <span style={{ color: '#ef4444' }}>━━ Critical Discrepancy</span>
      <span style={{ color: '#3b82f6' }}>| Target Opening</span>
      <span style={{ color: '#10b981' }}>| Construction Complete</span>
      <span style={{ color: '#f97316' }}>⋮ Forecast Opening</span>
      <span style={{ color: '#ef4444' }}>⋮ Today</span>
    </div>
  );
}

// ─── Bar renderer ─────────────────────────────────────────────────────────────

function WPBar({ task, onMouseEnter, onMouseLeave, onClick }) {
  const { x, barY, width, barHeight, phaseColor, isCritical, isBlocker,
          status, actual_progress, discrepancy } = task;

  const isDelayed    = status === 'delayed';
  const isCompleted  = status === 'completed';
  const isNotStarted = status === 'not_started';

  const baseOpacity = isNotStarted ? 0.45 : 1;
  const barFill = `${phaseColor}${isNotStarted ? '70' : 'CC'}`;

  // Progress overlay fill (darker shade)
  const progressWidth = Math.max(0, Math.min(width, (actual_progress / 100) * width));

  // Discrepancy indicator
  const discY = barY + barHeight * 0.7;
  const showDisc = discrepancy && discrepancy.status !== 'ok';
  const discColor = discrepancy?.status === 'critical' ? '#ef4444' : '#eab308';
  const discThickness = discrepancy?.status === 'critical' ? 3 : 2;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Critical path glow */}
      {isCritical && (
        <rect
          x={x - 2} y={barY - 2}
          width={width + 4} height={barHeight + 4}
          rx={6} ry={6}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2}
          opacity={0.5}
          filter="url(#glow)"
        />
      )}

      {/* Main bar background */}
      <rect
        x={x} y={barY}
        width={Math.max(2, width)} height={barHeight}
        rx={4} ry={4}
        fill={barFill}
        stroke={isDelayed ? '#ef4444' : (isCritical ? '#ef4444' : 'none')}
        strokeWidth={isDelayed ? 1.5 : (isCritical ? 1 : 0)}
        strokeDasharray={isDelayed ? '4,2' : 'none'}
        opacity={baseOpacity}
      />

      {/* Progress overlay */}
      {actual_progress > 0 && actual_progress < 100 && (
        <rect
          x={x} y={barY}
          width={progressWidth} height={barHeight}
          rx={4} ry={4}
          fill={phaseColor}
          opacity={0.9}
        />
      )}
      {isCompleted && (
        <rect
          x={x} y={barY}
          width={Math.max(2, width)} height={barHeight}
          rx={4} ry={4}
          fill={phaseColor}
          opacity={0.95}
        />
      )}

      {/* Bar label */}
      {width > 80 && (
        <text
          x={x + width / 2} y={barY + barHeight / 2 + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill="#fff" fontWeight={600}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {isCompleted ? `✓ ${task.label}` : task.label}
        </text>
      )}

      {/* Blocker icon */}
      {isBlocker && (
        <text
          x={x - 16} y={barY + barHeight / 2 + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={11} style={{ pointerEvents: 'none' }}
        >🔒</text>
      )}

      {/* Discrepancy indicator line */}
      {showDisc && (
        <>
          <line
            x1={x} y1={discY}
            x2={x + width} y2={discY}
            stroke={discColor}
            strokeWidth={discThickness}
            opacity={0.95}
          />
          {width > 40 && (
            <text
              x={x + width + 3} y={discY + 1}
              fontSize={9} fill={discColor} dominantBaseline="middle"
              style={{ pointerEvents: 'none' }}
            >
              SV:{discrepancy.site_visit_progress}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

// ─── Main GanttChart component ────────────────────────────────────────────────

export default function GanttChart({
  ganttData,
  layout: layoutProp,
  keyDates = {},
  discrepancies = [],
  onWPClick,
  viewMode = 'month',
  onViewModeChange,
  showArrows = true,
  onShowArrowsToggle,
  readOnly = false,
}) {
  const [collapseState, setCollapseState]   = useState({});
  const [tooltip, setTooltip]               = useState(null);
  const containerRef                        = useRef(null);
  const rightPanelRef                       = useRef(null);

  // Calculate container width for layout
  const [containerWidth, setContainerWidth] = useState(900);
  useEffect(() => {
    const el = rightPanelRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w) setContainerWidth(Math.max(600, w));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (layoutProp) return layoutProp;
    if (!ganttData || ganttData.length === 0) return null;
    return calculateLayout(ganttData, viewMode, containerWidth, keyDates, discrepancies, collapseState);
  }, [layoutProp, ganttData, viewMode, containerWidth, keyDates, discrepancies, collapseState]);

  const phases = useMemo(() => layout?.phases || [], [layout]);

  const handleCollapseToggle = useCallback((phaseId) => {
    setCollapseState(prev => ({ ...prev, [phaseId]: !prev[phaseId] }));
  }, []);

  const handleCollapseAll = useCallback(() => {
    const state = {};
    for (const p of phases) state[p.id] = true;
    setCollapseState(state);
  }, [phases]);

  const handleExpandAll = useCallback(() => {
    setCollapseState({});
  }, []);

  if (!layout) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 240, background: '#1e293b', borderRadius: 12, color: '#64748b', fontSize: 14 }}>
        Generating Gantt chart…
      </div>
    );
  }

  const { tasks, arrows, timelineHeaders, keyDateLines, chartWidth, totalHeight, ROW_HEIGHT } = layout;

  const fullSvgHeight = totalHeight + HEADER_H;

  // ── Left panel rows ────────────────────────────────────────────────────────
  const leftRows = [];
  for (const phase of phases) {
    // Phase header
    leftRows.push(
      <div key={`ph-${phase.id}`}
        onClick={() => handleCollapseToggle(phase.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: PHASE_ROW_H, padding: '0 10px',
          cursor: 'pointer', background: '#162032', borderBottom: '1px solid #334155',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#1e3a5f'}
        onMouseLeave={e => e.currentTarget.style.background = '#162032'}
      >
        <span style={{ fontSize: 10, color: '#64748b', width: 14, flexShrink: 0 }}>
          {collapseState[phase.id] ? '▶' : '▼'}
        </span>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden',
          whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
          {phase.label}
        </span>
        <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>
          ({phase.wps?.length || 0})
        </span>
      </div>
    );

    // WP rows (if not collapsed)
    if (!collapseState[phase.id]) {
      for (const wp of (phase.wps || [])) {
        const task = tasks.find(t => t.id === wp.id);
        const prog = task?.actual_progress ?? 0;
        leftRows.push(
          <div key={`wp-${wp.id}`}
            onClick={() => !readOnly && onWPClick?.(wp.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: ROW_HEIGHT, padding: `0 10px 0 ${LABEL_PAD + 14}px`,
              cursor: readOnly ? 'default' : 'pointer',
              background: task?.isCritical ? '#1a0a0a' : 'transparent',
              borderBottom: '1px solid #1e293b', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!readOnly) e.currentTarget.style.background = '#162032'; }}
            onMouseLeave={e => { e.currentTarget.style.background = task?.isCritical ? '#1a0a0a' : 'transparent'; }}
          >
            {task?.isBlocker && <span style={{ fontSize: 10 }}>🔒</span>}
            <span style={{ fontSize: 12, color: '#cbd5e1', flex: 1, overflow: 'hidden',
              whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
              {wp.label}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, flexShrink: 0,
              color: prog === 100 ? '#22c55e' : prog > 0 ? '#f59e0b' : '#475569',
              padding: '1px 6px', borderRadius: 4,
              background: prog === 100 ? '#052e16' : prog > 0 ? '#422006' : '#1e293b',
            }}>
              {prog}%
            </span>
          </div>
        );
      }
    }
  }

  // ── Timeline header SVG row ────────────────────────────────────────────────
  const headerSvg = (
    <svg width={chartWidth} height={HEADER_H} style={{ flexShrink: 0, display: 'block' }}>
      <rect width={chartWidth} height={HEADER_H} fill="#0f172a" />
      {timelineHeaders.map((h, i) => (
        <g key={i}>
          <line x1={h.x} y1={0} x2={h.x} y2={HEADER_H} stroke="#334155" strokeWidth={0.5} />
          <text x={h.x + h.width / 2} y={HEADER_H / 2 + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill="#94a3b8" fontWeight={600}>
            {h.label}
          </text>
        </g>
      ))}
    </svg>
  );

  // ── SVG definitions ────────────────────────────────────────────────────────
  const svgDefs = (
    <defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 Z" fill="#94a3b8" />
      </marker>
      <marker id="arrowhead-critical" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 Z" fill="#ef4444" />
      </marker>
    </defs>
  );

  // ── Phase header band lines (left border per phase) ────────────────────────
  const phaseBands = phases.map((phase, i) => {
    if (collapseState[phase.id]) return null;
    return (
      <rect
        key={`band-${phase.id}`}
        x={0} y={phase.y + PHASE_ROW_H}
        width={3} height={phase.height - PHASE_ROW_H}
        fill={phase.color}
        opacity={0.7}
      />
    );
  });

  // ── Key date vertical lines ────────────────────────────────────────────────
  const keyLines = keyDateLines.map((kd, i) => {
    const dash = kd.style === 'dashed' ? '8,4' : 'none';
    return (
      <g key={`kd-${kd.type}`}>
        <line
          x1={kd.x} y1={0}
          x2={kd.x} y2={totalHeight}
          stroke={kd.color}
          strokeWidth={kd.style === 'dashed' ? 1.5 : 2}
          strokeDasharray={dash}
          opacity={0.9}
        />
        {/* Diamond marker at top */}
        <polygon
          points={`${kd.x},4 ${kd.x+5},10 ${kd.x},16 ${kd.x-5},10`}
          fill={kd.color}
        />
        {/* Label */}
        <text
          x={kd.x + 4} y={6}
          fontSize={9} fill={kd.color} fontWeight={700}
          style={{ userSelect: 'none' }}
        >
          {kd.label}
        </text>
      </g>
    );
  });

  // ── Dependency arrows ──────────────────────────────────────────────────────
  const arrowEls = showArrows ? arrows.map((arrow, i) => (
    <path
      key={`arrow-${i}`}
      d={arrow.path}
      fill="none"
      stroke={arrow.isCritical ? '#ef4444' : '#94a3b8'}
      strokeWidth={1.5}
      opacity={0.6}
      markerEnd={arrow.isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead)'}
    />
  )) : [];

  // ── WP bars ───────────────────────────────────────────────────────────────
  const barEls = tasks.map(task => (
    <WPBar
      key={task.id}
      task={task}
      onMouseEnter={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({ wp: task, clientX: e.clientX - (rect?.left || 0), clientY: e.clientY - (rect?.top || 0) });
      }}
      onMouseLeave={() => setTooltip(null)}
      onClick={() => !readOnly && onWPClick?.(task.id)}
    />
  ));

  // ── Phase rows (header bars for collapsed phases) ─────────────────────────
  const phaseBarEls = phases.filter(p => collapseState[p.id]).map(phase => {
    const phaseTasks = tasks.filter(t => t.phaseId === phase.id);
    if (!phaseTasks.length) return null;
    const minX = Math.min(...phaseTasks.map(t => t.x));
    const maxX = Math.max(...phaseTasks.map(t => t.x + t.width));
    const avgProgress = Math.round(
      phaseTasks.reduce((s, t) => s + t.actual_progress, 0) / phaseTasks.length
    );
    const barY = phase.y + (PHASE_ROW_H - BAR_H) / 2;
    return (
      <g key={`phbar-${phase.id}`}>
        <rect x={minX} y={barY} width={Math.max(2, maxX - minX)} height={BAR_H}
          rx={4} fill={`${phase.color}55`} />
        <rect x={minX} y={barY} width={Math.max(0, (maxX - minX) * avgProgress / 100)} height={BAR_H}
          rx={4} fill={phase.color} opacity={0.8} />
        {(maxX - minX) > 60 && (
          <text x={minX + (maxX - minX) / 2} y={barY + BAR_H / 2 + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fill="#fff" fontWeight={600}>
            {phase.label} ({avgProgress}%)
          </text>
        )}
      </g>
    );
  });

  // ── Grid lines (row separators) ───────────────────────────────────────────
  const gridLines = [];
  for (let i = 0; i <= totalHeight / ROW_H; i++) {
    gridLines.push(
      <line key={`grid-${i}`} x1={0} y1={i * ROW_H} x2={chartWidth} y2={i * ROW_H}
        stroke="#1e293b" strokeWidth={0.5} />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', background: '#0f172a',
        borderRadius: 12, border: '1px solid #334155', overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif', position: 'relative' }}
    >
      {/* Controls */}
      <Controls
        viewMode={viewMode}
        onViewModeChange={onViewModeChange || (() => {})}
        showArrows={showArrows}
        onShowArrowsToggle={onShowArrowsToggle || (() => {})}
        collapseState={collapseState}
        phases={phases}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
      />

      {/* Chart body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 200 }}>

        {/* Left panel */}
        <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #334155',
          overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Spacer for timeline header */}
          <div style={{ height: HEADER_H, background: '#0f172a', borderBottom: '1px solid #334155', flexShrink: 0 }} />
          {/* Rows */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {leftRows}
          </div>
        </div>

        {/* Right panel */}
        <div ref={rightPanelRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Timeline header (sticky) */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
            {headerSvg}
          </div>

          {/* Main SVG */}
          <svg
            width={chartWidth}
            height={totalHeight}
            style={{ display: 'block', background: '#0f172a' }}
          >
            {svgDefs}

            {/* Grid */}
            {gridLines}

            {/* Phase bands */}
            {phaseBands}

            {/* Collapsed phase bars */}
            {phaseBarEls}

            {/* Arrows (behind bars) */}
            {arrowEls}

            {/* WP bars */}
            {barEls}

            {/* Key date lines (on top) */}
            {keyLines}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <Legend />

      {/* Tooltip */}
      <Tooltip tooltip={tooltip} containerRect={containerRef.current?.getBoundingClientRect()} />
    </div>
  );
}
