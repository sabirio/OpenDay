import { useAuth } from '../auth/AuthContext';
import { useAllRows } from '../hooks/useAllRows';
import { useGanttMetrics } from '../hooks/useGanttMetrics';
import { useHomeDashboardModel } from '../hooks/useHomeDashboardModel';
import MorningBrief    from '../components/home/MorningBrief';
import PrioritiesToday from '../components/home/PrioritiesToday';
import PortfolioHealth from '../components/home/PortfolioHealth';

function Home({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  const { role } = useAuth();
  const allRows     = useAllRows(projects, reports, siteVisits, templatesById, activeTemplateFallback);
  const ganttMetrics = useGanttMetrics(projects);
  const { kpis, insights, summary } = useHomeDashboardModel({ projects, reports, rows: allRows, ganttMetrics });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Home</h1>
          <p>Your daily focus — today's priorities and portfolio health at a glance.</p>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <MorningBrief summary={summary} projectCount={kpis.total} />
      <PrioritiesToday insights={insights} role={role} projectCount={kpis.total} />
      <PortfolioHealth kpis={kpis} />
    </div>
  );
}

export default Home;
