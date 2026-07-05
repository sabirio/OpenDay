// ── Filter bar sub-component ──────────────────────────────────────────────────

function FilterBar({ stores, contractors, filterStore, setFilterStore, filterContractor, setFilterContractor, showStore = true, showContractor = true }) {
  const selStyle = { height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-input)", cursor: "pointer", outline: "none", minWidth: 140 };
  const hasActive = (showStore && filterStore) || (showContractor && filterContractor);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {showStore && (
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={selStyle}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {showContractor && (
        <select value={filterContractor} onChange={e => setFilterContractor(e.target.value)} style={selStyle}>
          <option value="">All contractors</option>
          {contractors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {hasActive && (
        <button type="button" onClick={() => { setFilterStore(""); setFilterContractor(""); }}
          style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-muted)", background: "var(--accent-subtle)", cursor: "pointer" }}>
          Clear
        </button>
      )}
    </div>
  );
}

export default FilterBar;
