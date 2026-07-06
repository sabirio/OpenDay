import { useState } from "react";
import { getWPGroups } from "../../config/workPackages";
import { FormSection } from "./FormParts";

const WP_STATUS_OPTS = [
  { value: "Not Applicable", label: "Not Applicable", bg: "var(--field-neutral-bg)", color: "var(--field-neutral-fg)", border: "var(--field-neutral-border)" },
  { value: "Not Started",    label: "Not Started",    bg: "var(--field-bg-subtle)", color: "var(--field-text-secondary)", border: "var(--field-border-strong)" },
  { value: "In Progress",    label: "In Progress",    bg: "var(--field-warning-bg)", color: "var(--field-warning-fg)", border: "var(--field-warning-border)" },
  { value: "Completed",      label: "Completed",      bg: "var(--field-success-bg)", color: "var(--field-success-fg)", border: "var(--field-success-border)" },
];

const STATUS_SCORE = { "Not Applicable": null, "Not Started": 0, "In Progress": 0.5, "Completed": 1, "Delayed": 0.3 };

const STATUS_STYLE = {
  "Not Applicable": { color: "var(--field-neutral-fg)", bg: "var(--field-neutral-bg)" },
  "Not Started":    { color: "var(--field-text-secondary)", bg: "var(--field-bg-subtle)" },
  "In Progress":    { color: "var(--field-warning-fg)", bg: "var(--field-warning-bg)" },
  "Completed":      { color: "var(--field-success-fg)", bg: "var(--field-success-bg)" },
  "Delayed":        { color: "var(--field-delayed-fg)", bg: "var(--field-delayed-bg)" }, // legacy display only
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
    <div data-testid="task-row" data-wp-id={wpId} data-task-name={taskName} style={{ borderBottom: "1px solid var(--field-bg-subtle)", padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Task name */}
        <span style={{ flex: "1 1 180px", fontSize: 13, color: "var(--field-text-body)", lineHeight: 1.35, minWidth: 0 }}>
          {taskName}
        </span>

        {/* Last week indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 150 }}>
          <span style={{ fontSize: 10, color: "var(--field-text-muted)", whiteSpace: "nowrap" }}>Last week:</span>
          {prevStatus ? (
            <>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                background: STATUS_STYLE[prevStatus]?.bg || "var(--field-bg-subtle)",
                color: STATUS_STYLE[prevStatus]?.color || "var(--field-text-secondary)",
                border: `1px solid ${STATUS_STYLE[prevStatus]?.bg || "var(--field-border)"}`,
                whiteSpace: "nowrap",
              }}>{prevStatus}</span>
              {improved  && <span style={{ fontSize: 12, fontWeight: 800, color: "var(--field-success-fg)" }}>↑</span>}
              {regressed && <span style={{ fontSize: 12, fontWeight: 800, color: "var(--field-delayed-fg)" }}>↓</span>}
            </>
          ) : (
            <span style={{ fontSize: 11, color: "var(--field-border-strong)" }}>—</span>
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
                  border: `1px solid ${sel ? opt.border : "var(--field-border)"}`,
                  background: sel ? opt.bg : "white",
                  color: sel ? opt.color : "var(--field-text-muted)",
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
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 0 7px 2px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--field-bg-subtle)", textAlign: "left" }}
      >
        <span style={{ fontSize: 9, color: "var(--field-text-muted)", width: 10, flexShrink: 0 }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--field-text-body)", flex: 1, lineHeight: 1.3 }}>{group.name}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 6, flexShrink: 0,
          background: allDone ? "var(--field-success-bg)" : inProgCnt > 0 ? "var(--field-warning-bg)" : "var(--field-bg-faint)",
          color:      allDone ? "var(--field-success-fg)" : inProgCnt > 0 ? "var(--field-warning-fg)" : "var(--field-text-muted)",
          border: `1px solid ${allDone ? "var(--field-success-border)" : inProgCnt > 0 ? "var(--field-warning-border)" : "var(--field-border)"}`,
        }}>
          {completedCnt}/{taskNames.length}
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 18, borderLeft: "2px solid var(--field-bg-subtle)" }}>
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
    <span style={{ fontSize: 11, color: "var(--field-text-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>
      Pre-filled from {prevDate}
    </span>
  ) : null;

  return (
    <FormSection title={wp.name} accentColor="var(--field-accent-orange-fg)" badge={badge}>
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
