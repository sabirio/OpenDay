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
  const secondaryFilterCount = [
    salesMarketFilter,
    countryFilter,
    typeFilter,
    locationTypeFilter,
  ].filter((value) => value !== "All").length;

  const secondaryFilters = [
    { label: "Market", value: salesMarketFilter, set: onSalesMarketChange, options: salesMarketOptions },
    { label: "Country", value: countryFilter, set: onCountryChange, options: countryOptions },
    { label: "Project type", value: typeFilter, set: onTypeChange, options: typeOptions },
    { label: "Location type", value: locationTypeFilter, set: onLocationTypeChange, options: locationTypeOptions },
  ];

  return (
    <div className="portfolio-filter-stack">
      <label className="master-search">
        <span className="sr-only">Search projects</span>
        <input
          className="ds-input"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search projects..."
        />
      </label>

      <div className="portfolio-filter-primary">
        <details className="portfolio-filter-disclosure">
          <summary className={secondaryFilterCount > 0 ? "btn btn-secondary is-active" : "btn btn-secondary"}>
            Filters{secondaryFilterCount > 0 ? ` ${secondaryFilterCount}` : ""}
          </summary>
          <div className="portfolio-secondary-filters">
            {secondaryFilters.map(({ label, value, set, options }) => (
              <label key={label}>
                <span>{label}</span>
                <select className="ds-select" value={value} onChange={(event) => set(event.target.value)}>
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
        </details>

        <div className="master-quick-filters" aria-label="Project lifecycle filters">
          {[
            { id: "All", label: "All", count: totalCount },
            { id: "Active", label: "Active", count: activeCount },
            { id: "Completed", label: "Completed", count: completedCount },
          ].map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              className={statusFilter === id ? "master-quick-filter is-active" : "master-quick-filter"}
              aria-pressed={statusFilter === id}
              onClick={() => onStatusChange(id)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="portfolio-filter-summary">
        <span>{filteredCount} of {totalCount} projects</span>
        {filtersActive && <button type="button" className="btn-ghost-sm" onClick={onClearFilters}>Clear filters</button>}
      </div>
    </div>
  );
}
