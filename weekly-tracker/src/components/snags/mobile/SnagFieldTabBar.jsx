const TABS = [
  { key: 'plan', label: 'Plan', icon: '▦' },
  { key: 'list', label: 'List', icon: '≡' },
];
const ADD_TAB = { key: 'add', label: 'Add', icon: '+' };

export default function SnagFieldTabBar({ mode, onSelect, canCreate }) {
  const tabs = canCreate ? [TABS[0], ADD_TAB, TABS[1]] : TABS;
  return (
    <nav className="snag-field-tabbar" aria-label="Field Snag List navigation">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          className={`snag-field-tab${tab.key === 'add' ? ' is-add' : ''}${mode === tab.key ? ' is-active' : ''}`}
          aria-current={mode === tab.key ? 'page' : undefined}
          onClick={() => onSelect(tab.key)}
        >
          <span aria-hidden="true">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
