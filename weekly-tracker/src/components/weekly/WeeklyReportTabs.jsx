export default function WeeklyReportTabs({ tabs, activeTab, onChange, panelId = 'weekly-detail-tabpanel' }) {
  const handleKeyDown = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div className="detail-pane-tabs" role="tablist" aria-label="Weekly report review sections">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`weekly-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={panelId}
          tabIndex={activeTab === tab.id ? 0 : -1}
          className={activeTab === tab.id ? 'detail-tab is-active' : 'detail-tab'}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
