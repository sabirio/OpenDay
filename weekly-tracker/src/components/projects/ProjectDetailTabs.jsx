// Project detail view switcher (Information | Benchmark). Same accessible
// role="tablist"/role="tab" pattern and CSS classes as WeeklyReportTabs.jsx —
// kept as a small separate component rather than generalizing that one,
// since it lives in a different domain and this keeps the Benchmark change
// scoped; the two could be unified into one shared Tabs component later.
export default function ProjectDetailTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="weekly-console-tabs" role="tablist" aria-label="Project detail sections">
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
