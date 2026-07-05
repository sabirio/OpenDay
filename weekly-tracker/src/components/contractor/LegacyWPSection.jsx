import { useState } from "react";
import { getWPGroups } from "../../config/workPackages";
import { FormSection } from "./FormParts";

const WP_STATUS_OPTS = [
  { value: "Not Applicable", label: "Not Applicable", bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
  { value: "Not Started",    label: "Not Started",    bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db" },
  { value: "In Progress",    label: "In Progress",    bg: "#fef3c7", color: "#d97706", border: "#fde68a" },
  { value: "Completed",      label: "Completed",      bg: "#dcfce7", color: "#16a34a", border: "#86efac" },
];

const STATUS_SCORE = { "Not Applicable": null, "Not Started": 0, "In Progress": 0.5, "Completed": 1, "Delayed": 0.3 };

const STATUS_STYLE = {
  "Not Applicable": { color: "#7c3aed", bg: "#f5f3ff" },
  "Not Started":    { color: "#6b7280", bg: "#f3f4f6" },
  "In Progress":    { color: "#d97706", bg: "#fef3c7" },
  "Completed":      { color: "#16a34a", bg: "#dcfce7" },
  "Delayed":        { color: "#be185d", bg: "#fce7f3" }, // legacy display only
};

function WPTaskRow({ wpId, taskName, entry, prevEntry, onChange }) {
  const e          = entry || { status: "Not Started" };
  const prevStatus = prevEntry?.status ?? null;
  const curStatus  = e.status;
  const changed    = prevStatus !== null && prevStatus !== curStatus;
  const curScore   = STATUS_SCORE[curStatus]  ?? null;
  const prevScore  = STATUS_SCORE[prevStatus] ?? null;
  const improved   = changed && prevScore !== null && curScore !== null && curScore > prevScore;
  const regressed  = changed && prevScore !== null && curScore !== null && curScore < prevScore;

  return (
    <div data-testid="task-row" data-wp-id={wpId} data-task-name={taskName} style={{ borderBottom: "1px solid #f3f4f6", padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Task name */}
        <span style={{ flex: "1 1 180px", fontSize: 13, color: "#374151", lineHeight: 1.35, minWidth: 0 }}>
          {taskName}
        </span>

        {/* Last week indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 150 }}>
          <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>Last week:</span>
          {prevStatus ? (
            <>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                background: STATUS_STYLE[prevStatus]?.bg || "#f3f4f6",
                color: STATUS_STYLE[prevStatus]?.color || "#6b7280",
                border: `1px solid ${STATUS_STYLE[prevStatus]?.bg || "#e5e7eb"}`,
                whiteSpace: "nowrap",
              }}>{prevStatus}</span>
              {improved  && <span style={{ fontSize: 12, fontWeight: 800, color: "#16a34a" }}>↑</span>}
              {regressed && <span style={{ fontSize: 12, fontWeight: 800, color: "#be185d" }}>↓</span>}
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#d1d5db" }}>—</span>
          )}
        </div>

        {/* Status buttons */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {WP_STATUS_OPTS.map((opt) => {
            const sel = curStatus === opt.value;
            return (
              <button key={opt.value} type="button"
                data-testid={`status-btn-${opt.value}`}
                onClick={() => onChange({ ...e, status: opt.value })}
                style={{
                  padding: "4px 9px", borderRadius: 6, fontSize: 11,
                  border: `1px solid ${sel ? opt.border : "#e5e7eb"}`,
                  background: sel ? opt.bg : "white",
                  color: sel ? opt.color : "#9ca3af",
                  fontWeight: sel ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap",
                  outline: "none",
                }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Collapsible group row with subtasks inside
function GroupRow({ group, wpId, pkgStatuses, prevPkgStatuses, onChange }) {
  const [expanded, setExpanded] = useState(true);
  const taskNames    = group.tasks;
  const completedCnt = taskNames.filter(t => pkgStatuses?.[t]?.status === "Completed").length;
  const inProgCnt    = taskNames.filter(t => pkgStatuses?.[t]?.status === "In Progress").length;
  const allDone      = completedCnt === taskNames.length;

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 0 7px 2px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #f3f4f6", textAlign: "left" }}
      >
        <span style={{ fontSize: 9, color: "#9ca3af", width: 10, flexShrink: 0 }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1, lineHeight: 1.3 }}>{group.name}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 6, flexShrink: 0,
          background: allDone ? "#f0fdf4" : inProgCnt > 0 ? "#fffbeb" : "#f9fafb",
          color:      allDone ? "#16a34a" : inProgCnt > 0 ? "#d97706" : "#9ca3af",
          border: `1px solid ${allDone ? "#bbf7d0" : inProgCnt > 0 ? "#fde68a" : "#e5e7eb"}`,
        }}>
          {completedCnt}/{taskNames.length}
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 18, borderLeft: "2px solid #f3f4f6" }}>
          {taskNames.map(taskName => (
            <WPTaskRow
              key={taskName}
              wpId={wpId}
              taskName={taskName}
              entry={pkgStatuses?.[taskName]}
              prevEntry={prevPkgStatuses?.[taskName] ?? null}
              onChange={entry => onChange(taskName, entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WPSection({ wp, pkgStatuses, prevPkgStatuses, prevDate, onChange }) {
  function handleTask(taskName, entry) {
    onChange({ ...pkgStatuses, [taskName]: entry });
  }

  const groups = getWPGroups(wp.id);
  const badge  = prevDate ? (
    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, whiteSpace: "nowrap" }}>
      Pre-filled from {prevDate}
    </span>
  ) : null;

  return (
    <FormSection title={wp.name} accentColor="#f97316" badge={badge}>
      {groups.map(group => (
        <GroupRow
          key={group.id}
          group={group}
          wpId={wp.id}
          pkgStatuses={pkgStatuses}
          prevPkgStatuses={prevPkgStatuses}
          onChange={handleTask}
        />
      ))}
    </FormSection>
  );
}
