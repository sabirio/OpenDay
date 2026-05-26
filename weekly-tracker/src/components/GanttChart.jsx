import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_COLORS, addDays } from "../engines/ganttEngine";

// ── Layout constants ───────────────────────────────────────────────────────────
const ROW_H  = 38;
const HDR_H  = 54;
const LEFT_W = 296;

// Pixels-per-day for each zoom level
const ZOOM_LEVELS = [
  { id: "quarter", label: "Quarter", dw: 2  },
  { id: "month",   label: "Month",   dw: 4  },
  { id: "week",    label: "Week",    dw: 16 },
  { id: "day",     label: "Day",     dw: 32 },
];

// Timeline display modes
const TIMELINE_MODES = [
  { id: "AUTO",    label: "Auto"    },
  { id: "TODAY",   label: "Today"   },
  { id: "OPENING", label: "Opening" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDate(d) { return d instanceof Date ? d : new Date(d); }
function fmtMonth(date) {
  return toDate(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function buildHeader(projectStart, totalDays) {
  const start  = toDate(projectStart);
  const months = [];
  const days   = [];
  let monthKey = null;

  for (let i = 0; i < totalDays; i++) {
    const d  = addDays(start, i);
    const mk = `${d.getFullYear()}-${d.getMonth()}`;
    if (mk !== monthKey) {
      if (monthKey !== null) months[months.length - 1].span = i - months[months.length - 1].offset;
      months.push({ label: fmtMonth(d), offset: i });
      monthKey = mk;
    }
    days.push({ label: String(d.getDate()), offset: i, dow: d.getDay() });
  }
  if (months.length) months[months.length - 1].span = totalDays - months[months.length - 1].offset;
  return { months, days };
}

function depPath(tasks, depId, taskId, dw) {
  const pred = tasks.find((t) => t.id === depId);
  const succ = tasks.find((t) => t.id === taskId);
  if (!pred || !succ) return null;

  const predIdx = tasks.indexOf(pred);
  const succIdx = tasks.indexOf(succ);

  const pES = pred.earlyStart  ?? 0;
  const pEF = pred.earlyFinish ?? pES + (pred.duration || 1);
  const sES = succ.earlyStart  ?? 0;
  const sEF = succ.earlyFinish ?? sES + (succ.duration || 1);

  const AY = predIdx * ROW_H + ROW_H / 2;
  const BY = succIdx * ROW_H + ROW_H / 2;

  const depObj = (succ.dependencies || []).find((d) => d.id === depId);
  const type   = depObj?.type || "FS";

  switch (type) {
    case "FS": {
      const x1  = pEF * dw;
      const x2  = sES * dw;
      const mid = x1 + Math.max(10, (x2 - x1) / 2);
      if (x2 > x1 + 20) return `M ${x1} ${AY} H ${mid} V ${BY} H ${x2}`;
      return `M ${x1} ${AY} H ${x1 + 12} V ${Math.min(AY, BY) - 10} H ${x2 - 12} V ${BY} H ${x2}`;
    }
    case "SS": {
      const x = Math.min(pES, sES) * dw - 14;
      return `M ${pES * dw} ${AY} H ${x} V ${BY} H ${sES * dw}`;
    }
    case "FF": {
      const x = Math.max(pEF, sEF) * dw + 14;
      return `M ${pEF * dw} ${AY} H ${x} V ${BY} H ${sEF * dw}`;
    }
    case "SF": {
      const x = Math.min(pES * dw, sEF * dw) - 14;
      return `M ${pES * dw} ${AY} H ${x} V ${BY} H ${sEF * dw}`;
    }
    default: return null;
  }
}

// ── Vertical timeline marker ───────────────────────────────────────────────────

function TimelineMarker({ dayOffset, dw, chartH, color, label, zIndex = 5 }) {
  if (dayOffset == null || dayOffset < 0) return null;
  return (
    <div style={{
      position: "absolute", left: dayOffset * dw, top: 0,
      width: 2, height: chartH, background: color, zIndex, pointerEvents: "none",
    }}>
      <div style={{
        position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
        background: color, color: "#fff", fontSize: 9, fontWeight: 700,
        padding: "2px 5px", borderRadius: 4, whiteSpace: "nowrap",
      }}>{label}</div>
    </div>
  );
}

// ── GanttChart ─────────────────────────────────────────────────────────────────
// Props:
//   tasks           — scheduled tasks from calculateSchedule()
//   projectStart    — ISO string or Date
//   openingDate     — ISO string or Date (optional) — orange Opening marker
//   onTaskMove      — fn(taskId, newEarlyStart, newDuration) — drag commit handler
//   onTaskSelect    — fn(task) — bar click handler (optional; pass null to disable)
//   today           — override today (optional, defaults to new Date())

function GanttChart({ tasks = [], projectStart, openingDate, onTaskMove, onTaskSelect, today: todayProp }) {
  const today = useMemo(() => todayProp ? toDate(todayProp) : new Date(), [todayProp]);

  const [zoom,         setZoom]         = useState("week");
  const [timelineMode, setTimelineMode] = useState("AUTO");
  const [drag,         setDrag]         = useState(null);
  const [hovered,      setHovered]      = useState(null);
  const chartRef = useRef(null);

  const dw    = ZOOM_LEVELS.find((z) => z.id === zoom)?.dw ?? 16;
  const start = useMemo(() => toDate(projectStart || new Date()), [projectStart]);

  // ── Dynamic timeline range ─────────────────────────────────────────────────
  // Includes all task earlyFinish values, opening date, baseline finish,
  // plus a buffer of max(14 days, 5% of total range).

  const totalDays = useMemo(() => {
    if (!tasks.length) return 60;

    const maxTaskDays = Math.max(
      ...tasks.map((t) => t.earlyFinish ?? ((t.earlyStart ?? 0) + (t.duration || 1)))
    );

    let openingOff = 0;
    if (openingDate) {
      openingOff = Math.max(0, Math.round((toDate(openingDate) - start) / 86400000));
    }

    const baselineOff = tasks.reduce((mx, t) => {
      if (!t.baselineFinish) return mx;
      return Math.max(mx, Math.round((toDate(t.baselineFinish) - start) / 86400000));
    }, 0);

    const maxDays = Math.max(maxTaskDays, openingOff, baselineOff, 30);
    const buffer  = Math.max(14, Math.ceil(maxDays * 0.05));
    return maxDays + buffer;
  }, [tasks, start, openingDate]);

  // ── Marker day offsets ─────────────────────────────────────────────────────

  const todayOffset = useMemo(() => Math.round((today - start) / 86400000), [today, start]);

  const openingOffset = useMemo(() => {
    if (!openingDate) return null;
    return Math.round((toDate(openingDate) - start) / 86400000);
  }, [openingDate, start]);

  const forecastOffset = useMemo(
    () => (tasks.length ? Math.max(...tasks.map((t) => t.earlyFinish ?? 0)) : null),
    [tasks]
  );

  const baselineOffset = useMemo(() => {
    const vals = tasks
      .filter((t) => t.baselineEarlyFinish !== undefined)
      .map((t) => t.baselineEarlyFinish);
    return vals.length ? Math.max(...vals) : null;
  }, [tasks]);

  const { months, days } = useMemo(() => buildHeader(start, totalDays), [start, totalDays]);

  const chartW = totalDays * dw;
  const chartH = tasks.length * ROW_H;

  // ── Scroll on mode / zoom change ───────────────────────────────────────────

  useEffect(() => {
    if (!chartRef.current) return;
    const half = chartRef.current.clientWidth / 2;
    let target = 0;
    switch (timelineMode) {
      case "TODAY":
        target = todayOffset * dw - half;
        break;
      case "OPENING":
        target = ((openingOffset ?? todayOffset) * dw) - half;
        break;
      case "AUTO":
      default: {
        const firstActive = tasks.find((t) => t.critical && t.status !== "Completed");
        target = (firstActive ? (firstActive.earlyStart ?? 0) : todayOffset) * dw - half;
        break;
      }
    }
    chartRef.current.scrollLeft = Math.max(0, target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineMode, zoom, todayOffset, openingOffset, tasks.length]);

  // ── Drag ──────────────────────────────────────────────────────────────────

  const onBarMouseDown = useCallback((e, task, mode) => {
    if (!onTaskMove) return;
    e.stopPropagation(); e.preventDefault();
    setDrag({ taskId: task.id, mode, startX: e.clientX, origES: task.earlyStart ?? 0, origDur: task.duration || 1 });
  }, [onTaskMove]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const delta = Math.round((e.clientX - drag.startX) / dw);
      setDrag((d) => ({ ...d, _delta: delta }));
    };
    const onUp = () => {
      if (!drag._delta) { setDrag(null); return; }
      if (drag.mode === "move")   onTaskMove?.(drag.taskId, Math.max(0, drag.origES + drag._delta), drag.origDur);
      if (drag.mode === "resize") onTaskMove?.(drag.taskId, drag.origES, Math.max(1, drag.origDur + drag._delta));
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag, dw, onTaskMove]);

  function resolveTask(task) {
    if (!drag || drag.taskId !== task.id || !drag._delta) return task;
    const d = drag._delta;
    if (drag.mode === "move")   return { ...task, earlyStart: Math.max(0, task.earlyStart + d), earlyFinish: Math.max(1, task.earlyFinish + d) };
    if (drag.mode === "resize") return { ...task, earlyFinish: Math.max(task.earlyStart + 1, task.earlyFinish + d), duration: Math.max(1, task.duration + d) };
    return task;
  }

  // ── Dependency arrows ──────────────────────────────────────────────────────

  const depPaths = useMemo(() => {
    const paths = [];
    tasks.forEach((task) => {
      (task.dependencies || []).forEach((dep) => {
        const d = depPath(tasks, dep.id, task.id, dw);
        if (d) paths.push({ key: `${dep.id}-${task.id}`, d, critical: task.critical });
      });
    });
    return paths;
  }, [tasks, dw]);

  // ── Button style helper ────────────────────────────────────────────────────

  const btn = (active, ac = "#2563eb", ab = "#1e3a5f") => ({
    padding: "5px 11px", borderRadius: 7, border: `1.5px solid ${active ? ac : "#334155"}`,
    background: active ? ab : "#0f172a", color: active ? "#60a5fa" : "#64748b",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ userSelect: "none" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.07em", marginRight: 4 }}>Zoom</span>
          {ZOOM_LEVELS.map((z) => (
            <button key={z.id} type="button" onClick={() => setZoom(z.id)} style={btn(zoom === z.id)}>{z.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.07em", marginRight: 4 }}>View</span>
          {TIMELINE_MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setTimelineMode(m.id)} style={btn(timelineMode === m.id, "#d97706", "#422006")}>{m.label}</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: "#64748b" }}>
          <span style={{ color: "#dc2626" }}>━ Today</span>
          {openingOffset  != null && <span style={{ color: "#2563eb" }}>━ Opening</span>}
          {forecastOffset != null && <span style={{ color: "#eab308" }}>━ Forecast</span>}
          {baselineOffset != null && <span style={{ color: "#475569" }}>━ Baseline</span>}
          <span>{tasks.length} task{tasks.length !== 1 ? "s" : ""} · {totalDays}d</span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ display: "flex", border: "1px solid #334155", borderRadius: 12, overflow: "hidden", background: "#0f172a" }}>

        {/* Left panel */}
        <div style={{ width: LEFT_W, flexShrink: 0, borderRight: "1px solid #334155", background: "#1e293b" }}>
          <div style={{ height: HDR_H, display: "flex", alignItems: "flex-end", padding: "0 12px 8px", borderBottom: "1px solid #334155", background: "#0f172a" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.06em" }}>Task</span>
          </div>
          {tasks.map((rawTask) => {
            const task = resolveTask(rawTask);
            const sc   = STATUS_COLORS[task.status] || "#475569";
            return (
              <div key={task.id}
                onClick={() => onTaskSelect?.(rawTask)}
                onMouseEnter={() => setHovered(task.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  height: ROW_H, display: "flex", alignItems: "center", gap: 8,
                  padding: "0 12px", borderBottom: "1px solid #1e293b",
                  background: drag?.taskId === task.id ? "#0d2d1e" : hovered === task.id ? "#263347" : "transparent",
                  cursor: onTaskSelect ? "pointer" : "default", transition: "background 0.1s",
                }}
              >
                <div style={{ width: 3, height: 20, borderRadius: 2, flexShrink: 0, background: task.critical ? "#dc2626" : sc }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.critical && <span style={{ color: "#dc2626", marginRight: 4 }}>⚡</span>}
                    {task.name}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: sc, fontWeight: 700 }}>{task.status === "Not Started" ? "—" : task.status}</div>
                  <div style={{ width: 40, height: 3, background: "#334155", borderRadius: 2, marginTop: 2 }}>
                    <div style={{ width: `${task.progress}%`, height: "100%", background: sc, borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right scrollable timeline */}
        <div ref={chartRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}>

          {/* Sticky header */}
          <div style={{ height: HDR_H, background: "#0f172a", borderBottom: "1px solid #334155", position: "sticky", top: 0, zIndex: 10, minWidth: chartW }}>
            <div style={{ height: 26, display: "flex", borderBottom: "1px solid #1e293b", position: "relative" }}>
              {months.map((m) => (
                <div key={m.label + m.offset} style={{
                  position: "absolute", left: m.offset * dw, width: (m.span ?? 0) * dw,
                  height: "100%", display: "flex", alignItems: "center", paddingLeft: 8,
                  fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                  letterSpacing: "0.05em", overflow: "hidden", whiteSpace: "nowrap",
                  borderRight: "1px solid #1e293b",
                }}>{m.label}</div>
              ))}
            </div>
            <div style={{ height: 28, position: "relative" }}>
              {dw >= 8
                ? days.map((day) => (
                    <div key={day.offset} style={{
                      position: "absolute", left: day.offset * dw, width: dw,
                      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: day.dow === 0 || day.dow === 6 ? "#475569" : "#64748b",
                      borderRight: "1px solid #1e293b",
                      background: day.offset === todayOffset ? "#1e3a5f" : "transparent",
                    }}>{dw >= 16 ? day.label : ""}</div>
                  ))
                : days.filter((d) => d.dow === 1).map((day) => (
                    <div key={day.offset} style={{
                      position: "absolute", left: day.offset * dw, width: 7 * dw,
                      height: "100%", display: "flex", alignItems: "center",
                      paddingLeft: 4, fontSize: 9, color: "#64748b", borderRight: "1px solid #1e293b",
                    }}>W{Math.floor(day.offset / 7) + 1}</div>
                  ))
              }
            </div>
          </div>

          {/* Body */}
          <div style={{ position: "relative", minWidth: chartW, height: Math.max(chartH, 60) }}>

            {/* Weekend shading */}
            {dw >= 8 && days.filter((d) => d.dow === 0 || d.dow === 6).map((day) => (
              <div key={day.offset} style={{
                position: "absolute", left: day.offset * dw, top: 0,
                width: dw, height: chartH, background: "rgba(0,0,0,0.15)", pointerEvents: "none",
              }} />
            ))}

            {/* Markers */}
            <TimelineMarker dayOffset={todayOffset}    dw={dw} chartH={Math.max(chartH, 60)} color="#dc2626" label="TODAY"    zIndex={7} />
            <TimelineMarker dayOffset={openingOffset}  dw={dw} chartH={Math.max(chartH, 60)} color="#2563eb" label="OPENING"  zIndex={6} />
            <TimelineMarker dayOffset={forecastOffset} dw={dw} chartH={Math.max(chartH, 60)} color="#eab308" label="FORECAST" zIndex={5} />
            <TimelineMarker dayOffset={baselineOffset} dw={dw} chartH={Math.max(chartH, 60)} color="#475569" label="BASELINE" zIndex={4} />

            {/* Dependency arrows */}
            <svg style={{ position: "absolute", inset: 0, width: chartW, height: Math.max(chartH, 60), pointerEvents: "none", zIndex: 4 }}
              viewBox={`0 0 ${chartW} ${Math.max(chartH, 60)}`} overflow="visible">
              <defs>
                <marker id="arr"      markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#475569" />
                </marker>
                <marker id="arr-crit" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M 0 0 L 7 3.5 L 0 7 Z" fill="#dc262680" />
                </marker>
              </defs>
              {depPaths.map(({ key, d, critical }) => (
                <path key={key} d={d} fill="none"
                  stroke={critical ? "#dc262660" : "#33415580"}
                  strokeWidth={critical ? 1.5 : 1}
                  markerEnd={critical ? "url(#arr-crit)" : "url(#arr)"}
                  strokeDasharray={critical ? undefined : "4 3"}
                />
              ))}
            </svg>

            {/* Task bars */}
            {tasks.map((rawTask, idx) => {
              const task     = resolveTask(rawTask);
              const es       = task.earlyStart  ?? 0;
              const ef       = task.earlyFinish ?? es + (task.duration || 1);
              const sc       = STATUS_COLORS[task.status] || "#475569";
              const isDrag   = drag?.taskId === task.id;
              const isHov    = hovered === task.id;
              const barLeft  = es * dw;
              const barWidth = Math.max(dw, (ef - es) * dw);
              const barTop   = idx * ROW_H + 6;
              const barH     = ROW_H - 12;

              return (
                <div key={task.id} style={{
                  position: "absolute", top: barTop, left: barLeft,
                  width: barWidth, height: barH, borderRadius: 5,
                  background: task.critical ? `${sc}30` : `${sc}20`,
                  border: `1.5px solid ${task.critical ? sc : sc + "80"}`,
                  boxShadow: isDrag ? `0 0 0 2px ${sc}` : isHov ? `0 0 0 1px ${sc}60` : "none",
                  cursor: onTaskMove ? (isDrag ? "grabbing" : "grab") : "default",
                  zIndex: isDrag ? 8 : 3, overflow: "hidden",
                  transition: isDrag ? "none" : "box-shadow 0.1s",
                }}
                  onMouseDown={(e) => onBarMouseDown(e, rawTask, "move")}
                >
                  {/* Progress fill */}
                  <div style={{ position: "absolute", inset: 0, width: `${task.progress}%`, background: sc + "60", borderRadius: 4 }} />

                  {/* Baseline variance stripe (red = behind, green = ahead) */}
                  {task.scheduleVariance != null && task.scheduleVariance !== 0 && (
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                      background: task.scheduleVariance > 0 ? "#dc2626" : "#16a34a",
                    }} />
                  )}

                  {barWidth > 40 && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {task.name}
                      </span>
                    </div>
                  )}

                  {onTaskMove && (
                    <div style={{
                      position: "absolute", right: 0, top: 0, bottom: 0, width: 6,
                      cursor: "ew-resize", background: sc, opacity: 0.6, borderRadius: "0 4px 4px 0",
                    }}
                      onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, rawTask, "resize"); }}
                    />
                  )}
                </div>
              );
            })}

            {/* Row hover stripes */}
            {tasks.map((task, idx) => (
              <div key={"stripe-" + task.id} style={{
                position: "absolute", left: 0, top: idx * ROW_H, width: chartW, height: ROW_H,
                background: hovered === task.id ? "rgba(148,163,184,0.04)" : "transparent",
                pointerEvents: "none", borderBottom: "1px solid #1e293b", transition: "background 0.1s",
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GanttChart;
