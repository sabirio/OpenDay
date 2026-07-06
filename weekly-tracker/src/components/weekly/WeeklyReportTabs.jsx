export default function WeeklyReportTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="weekly-console-tabs" role="tablist" aria-label="Weekly report review sections">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? 'weekly-console-tab is-active' : 'weekly-console-tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
