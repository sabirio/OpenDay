import { Link } from 'react-router-dom';
import { canAccessResource } from '../../hooks/useDefaultRoute.js';
import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';

const HOME_SHORTCUTS = [
  { to: '/', resource: 'dashboard', label: 'Project Dashboard', description: 'inspect project attention' },
  { to: '/weekly-reports', resource: 'weekly_reports', label: 'Weekly Reports', description: 'review reporting evidence' },
  { to: '/risk', resource: 'risk_engine', label: 'Risk Dashboard', description: 'investigate risk drivers' },
  { to: '/site-visit-select', resource: 'site_visit', label: 'Site Visit', description: 'record PM evidence' },
];

export default function ContinueWork({ role }) {
  const shortcuts = HOME_SHORTCUTS.filter(item => canAccessResource(role, item.resource));

  return (
    <AnalyticalSection
      className="home-continue-work"
      title="Continue work"
      description="Open the workspace that matches your next task."
      accessory="Role-aware"
      headingLevel="h2"
      ruled={false}
    >
      <nav className="home-quick-links" aria-label="Continue work">
        {shortcuts.map(item => (
          <Link key={item.to} to={item.to}>
            <strong>{item.label}</strong>
            <span> — {item.description} →</span>
          </Link>
        ))}
      </nav>
    </AnalyticalSection>
  );
}
