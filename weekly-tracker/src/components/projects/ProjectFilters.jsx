export default function ProjectFilters({
  searchQuery,
  onSearchChange,
  salesMarketFilter,
  onSalesMarketChange,
  salesMarketOptions,
  countryFilter,
  onCountryChange,
  countryOptions,
  statusFilter,
  onStatusChange,
  statusOptions,
  typeFilter,
  onTypeChange,
  typeOptions,
  locationTypeFilter,
  onLocationTypeChange,
  locationTypeOptions,
  filtersActive,
  onClearFilters,
  filteredCount,
  totalCount,
  activeCount,
  completedCount,
}) {
  const selects = [
    { val: salesMarketFilter, set: onSalesMarketChange, opts: salesMarketOptions, placeholder: "All markets" },
    { val: countryFilter, set: onCountryChange, opts: countryOptions, placeholder: "All countries" },
    { val: statusFilter, set: onStatusChange, opts: statusOptions, placeholder: "All statuses" },
    { val: typeFilter, set: onTypeChange, opts: typeOptions, placeholder: "All types" },
    { val: locationTypeFilter, set: onLocationTypeChange, opts: locationTypeOptions, placeholder: "All location types" },
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }}>Search</span>
        <input className="ds-input" value={searchQuery} onChange={e => onSearchChange(e.target.value)} placeholder="Search..." style={{ paddingLeft: 58, minWidth: 180 }} />
      </div>
      {selects.map(({ val, set, opts, placeholder }, i) => (
        <select key={i} className="ds-select" value={val} onChange={e => set(e.target.value)} style={{ cursor: "pointer" }}>
          {opts.map(o => <option key={o} value={o}>{o === "All" ? placeholder : o}</option>)}
        </select>
      ))}
      {filtersActive && (
        <button type="button" className="btn-ghost-sm" onClick={onClearFilters}>Clear x</button>
      )}
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{filteredCount} / {totalCount} projects</span>
        <div className="metric-pill"><span>Active</span><strong>{activeCount}</strong></div>
        <div className="metric-pill"><span>Completed</span><strong>{completedCount}</strong></div>
      </div>
    </div>
  );
}
