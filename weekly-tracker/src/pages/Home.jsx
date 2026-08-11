import { useAuth } from '../auth/AuthContext';
import { useAllRows } from '../hooks/useAllRows';
import { useGanttMetrics } from '../hooks/useGanttMetrics';
import { useHomeDashboardModel } from '../hooks/useHomeDashboardModel';
import MorningBrief from '../components/home/MorningBrief';
import PrioritiesToday from '../components/home/PrioritiesToday';
import PortfolioHealth from '../components/home/PortfolioHealth';
import RecentActivity from '../components/home/RecentActivity';
import ContinueWork from '../components/home/ContinueWork';
import { buildRecentActivity } from '../components/home/homePresentation.js';

function Home({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  const { role } = useAuth();
  const allRows = useAllRows(projects, reports, siteVisits, templatesById, activeTemplateFallback);
  const ganttMetrics = useGanttMetrics(projects);
  const { kpis, insights, summary } = useHomeDashboardModel({ projects, reports, rows: allRows, ganttMetrics });
  const recentActivity = buildRecentActivity({ projects, reports, siteVisits });

  const today = new Date();

  return (
    <div className="home-page">
      <div className="page-header home-header">
        <div>
          <h1>Home</h1>
          <p>Operational briefing across your permitted portfolio</p>
        </div>
        <time className="home-header-date" dateTime={today.toISOString().slice(0, 10)}>
          {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </time>
      </div>

      <div className="home-content-grid">
        <section className="home-attention-region" aria-label="Needs attention">
          <MorningBrief
            summary={summary}
            insights={insights}
            projects={projects}
            projectCount={kpis.total}
          />
          <PrioritiesToday insights={insights} projects={projects} role={role} />
        </section>
        <ContinueWork role={role} />
        <PortfolioHealth kpis={kpis} />
        <RecentActivity items={recentActivity} />
      </div>
    </div>
  );
}

export default Home;
