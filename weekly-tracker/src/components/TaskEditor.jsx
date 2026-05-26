import { useEffect, useState } from "react";
import { TASK_STATUSES, STATUS_COLORS } from "../engines/ganttEngine";
import DependencyEditor from "./DependencyEditor";

// ── TaskEditor ────────────────────────────────────────────────────────────────
// Modal for creating / editing a single Gantt task.
// Props:
//   task       — the task to edit (null → create new)
//   allTasks   — all tasks (for dependency picker)
//   onSave     — fn(updatedTask)
//   onDelete   — fn(taskId)
//   onClose    — fn()

const FIELD = {
  background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
  color: "#e2e8f0", fontSize: 13, padding: "8px 12px", outline: "none", width: "100%",
};

function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 5 }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TaskEditor({ task, allTasks = [], onSave, onDelete, onClose }) {
  const isNew = !task?.id;

  const [form, setForm] = useState({
    name: "",
    duration: 5,
    weight: 1,
    status: "Not Started",
    progress: 0,
    actualStart: "",
    actualFinish: "",
    dependencies: [],
  });

  useEffect(() => {
    if (task) {
      setForm({
        name: task.name || "",
        duration: task.duration || 5,
        weight: task.weight || 1,
        status: task.status || "Not Started",
        progress: task.progress ?? 0,
        actualStart: task.actualStart || "",
        actualFinish: task.actualFinish || "",
        dependencies: task.dependencies || [],
      });
    }
  }, [task]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSave() {
    if (!form.name.trim()) return;
    onSave({
      ...(task || {}),
      name: form.name.trim(),
      duration: Math.max(1, Number(form.duration) || 1),
      weight: Math.max(0.1, Number(form.weight) || 1),
      status: form.status,
      progress: Math.min(100, Math.max(0, Number(form.progress) || 0)),
      actualStart: form.actualStart || null,
      actualFinish: form.actualFinish || null,
      dependencies: form.dependencies,
    });
  }

  const statusColor = STATUS_COLORS[form.status] || "#475569";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000 }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 560, maxWidth: "95vw", maxHeight: "90vh",
        background: "#1e293b", borderRadius: 16, zIndex: 2001,
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #334155", borderTop: `4px solid ${statusColor}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>
              {isNew ? "New Task" : `Edit: ${task.name}`}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
            >×</button>
          </div>
          {!isNew && task.critical && (
            <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5, background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: "#fca5a5" }}>
              ⚡ Critical Path
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "grid", gap: 16 }}>

          <Field label="Task Name">
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Electrical Rough-in"
              style={FIELD}
              autoFocus
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Duration (days)">
              <input
                type="number" min={1} max={999}
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
                style={FIELD}
              />
            </Field>
            <Field label="Weight">
              <input
                type="number" min={0.1} step={0.1}
                value={form.weight}
                onChange={(e) => set("weight", e.target.value)}
                style={FIELD}
              />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value)} style={FIELD}>
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label={`Progress — ${form.progress}%`}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range" min={0} max={100} step={5}
                value={form.progress}
                onChange={(e) => set("progress", Number(e.target.value))}
                style={{ flex: 1, accentColor: statusColor }}
              />
              <div style={{ width: 40, height: 6, background: "#334155", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${form.progress}%`, height: "100%", background: statusColor, borderRadius: 3, transition: "width 0.2s" }} />
              </div>
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Actual Start">
              <input
                type="date"
                value={form.actualStart || ""}
                onChange={(e) => set("actualStart", e.target.value || null)}
                style={FIELD}
              />
            </Field>
            <Field label="Actual Finish">
              <input
                type="date"
                value={form.actualFinish || ""}
                onChange={(e) => set("actualFinish", e.target.value || null)}
                style={FIELD}
              />
            </Field>
          </div>

          <div style={{ borderTop: "1px solid #334155", paddingTop: 14 }}>
            <DependencyEditor
              dependencies={form.dependencies}
              allTasks={allTasks}
              currentTaskId={task?.id}
              onChange={(deps) => set("dependencies", deps)}
            />
          </div>

          {/* Schedule info (read-only) */}
          {!isNew && task.plannedStart && (
            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "12px 16px" }}>
              <Label>Computed Schedule</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8 }}>
                {[
                  ["Planned Start",  task.plannedStart ? new Date(task.plannedStart).toLocaleDateString("en-GB") : "—"],
                  ["Planned Finish", task.plannedFinish ? new Date(task.plannedFinish).toLocaleDateString("en-GB") : "—"],
                  ["Total Float",    `${task.totalFloat ?? "—"}d`],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #334155", display: "flex", gap: 10, justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            {!isNew && onDelete && (
              <button
                type="button"
                onClick={() => { if (window.confirm(`Delete "${task.name}"?`)) { onDelete(task.id); onClose(); } }}
                style={{ padding: "8px 18px", borderRadius: 9, border: "1.5px solid #7f1d1d", background: "#450a0a", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "8px 20px", borderRadius: 9, border: "1.5px solid #334155", background: "#1e293b", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!form.name.trim()}
              style={{
                padding: "8px 24px", borderRadius: 9, border: "none",
                background: form.name.trim() ? "#2f855a" : "#1e293b",
                color: form.name.trim() ? "#fff" : "#475569",
                fontSize: 13, fontWeight: 700,
                cursor: form.name.trim() ? "pointer" : "default",
              }}
            >
              {isNew ? "Create Task" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default TaskEditor;
