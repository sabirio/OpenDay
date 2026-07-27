export default function ProjectDetailTabs({ tabs, activeTab, onChange }) {
  const handleKeyDown = (event, index) => {
    let nextIndex = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    onChange(tabs[nextIndex].id);
    event.currentTarget.parentElement
      ?.querySelector(`#portfolio-tab-${tabs[nextIndex].id}`)
      ?.focus();
  };

  return (
    <div className="detail-pane-tabs" role="tablist" aria-label="Project detail sections">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`portfolio-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls="portfolio-detail-tabpanel"
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={activeTab === tab.id ? "detail-tab is-active" : "detail-tab"}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
