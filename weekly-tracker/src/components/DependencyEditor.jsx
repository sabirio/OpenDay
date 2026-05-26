import { useState } from "react";
import { DEP_TYPES, DEP_LABELS } from "../engines/ganttEngine";

// ── DependencyEditor ──────────────────────────────────────────────────────────
// Props:
//   dependencies  — current array of {id, type, lag}
//   allTasks      — full task list (for the picker)
//   currentTaskId — the task being edited (excluded from the picker)
//   onChange      — fn(updatedDependencies)

function DependencyEditor({ dependencies = [], allTasks = [], currentTaskId, onChange }) {
  const [newDepId,   setNewDepId]   = useState("");
  const [newDepType, setNewDepType] = useState("FS");
  const [newDepLag,  setNewDepLag]  = useState(0);

  const availableTasks = allTasks.filter(
    (t) => t.id !== currentTaskId && !dependencies.some((d) => d.id === t.id)
  );

  function addDep() {
    if (!newDepId) return;
    onChange([...dependencies, { id: newDepId, type: newDepType, lag: Number(newDepLag) || 0 }]);
    setNewDepId("");
    setNewDepType("FS");
    setNewDepLag(0);
  }

  function removeDep(id) {
    onChange(dependencies.filter((d) => d.id !== id));
  }

  function updateDep(id, field, value) {
    onChange(
      dependencies.map((d) =>
        d.id === id
          ? { ...d, [field]: field === "lag" ? Number(value) || 0 : value }
          : d
      )
    );
  }

  const taskName = (id) => allTasks.find((t) => t.id === id)?.name || id;

  const selectStyle = {
    background: "#0f172a", border: "1px solid #334155", borderRadius: 6,
    color: "#e2e8f0", fontSize: 12, padding: "4px 8px", outline: "none",
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 8 }}>
        Dependencies
      </div>

      {/* Existing dependencies */}
      {dependencies.length === 0 ? (
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>No dependencies</div>
      ) : (
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          {dependencies.map((dep) => (
            <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, color: "#e2e8f0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {taskName(dep.id)}
              </span>
              <select value={dep.type} onChange={(e) => updateDep(dep.id, "type", e.target.value)} style={selectStyle}>
                {DEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="number"
                value={dep.lag}
                onChange={(e) => updateDep(dep.id, "lag", e.target.value)}
                placeholder="lag"
                title="Lag in days"
                style={{ ...selectStyle, width: 52 }}
              />
              <span style={{ fontSize: 10, color: "#475569" }}>d lag</span>
              <button
                type="button"
                onClick={() => removeDep(dep.id)}
                style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 4px" }}
                title="Remove dependency"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add new dependency */}
      {availableTasks.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={newDepId}
            onChange={(e) => setNewDepId(e.target.value)}
            style={{ ...selectStyle, flex: 1, minWidth: 120 }}
          >
            <option value="">— select predecessor —</option>
            {availableTasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select value={newDepType} onChange={(e) => setNewDepType(e.target.value)} style={selectStyle}>
            {DEP_TYPES.map((t) => <option key={t} value={t}>{DEP_LABELS[t]}</option>)}
          </select>
          <input
            type="number"
            value={newDepLag}
            onChange={(e) => setNewDepLag(e.target.value)}
            placeholder="0"
            title="Lag (days)"
            style={{ ...selectStyle, width: 52 }}
          />
          <button
            type="button"
            onClick={addDep}
            disabled={!newDepId}
            style={{
              padding: "5px 14px", borderRadius: 7, border: "none",
              background: newDepId ? "#2563eb" : "#1e293b",
              color: newDepId ? "#fff" : "#475569",
              fontSize: 12, fontWeight: 600, cursor: newDepId ? "pointer" : "default",
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export default DependencyEditor;
