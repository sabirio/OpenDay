import { useMemo } from 'react';
import { useAllRows } from '../hooks/useAllRows';
import { computePortfolioAlerts, computePortfolioKpis } from '../engines/portfolioEngine';
import { computeProjectRiskScore } from '../engines/riskEngine';
import { calculateProgressComparison } from '../engines/progressEngine';
import { computeOpeningReadiness } from '../engines/openingReadinessEngine';
import { getCommands } from '../engines/commandEngine';
import { buildHomeInsights, summarizeInsights } from '../core/insights/selectors/homeInsights';
import MorningBrief    from '../components/home/MorningBrief';
import PrioritiesToday from '../components/home/PrioritiesToday';
import PortfolioHealth from '../components/home/PortfolioHealth';

function Home({ projects, reports, siteVisits = [] }) {
  const allRows = useAllRows(projects, reports, siteVisits);

  const alerts = useMemo(() => computePortfolioAlerts(allRows), [allRows]);

  const allCommands = useMemo(() =>
    allRows.flatMap(({ project, progress, projReports, projSiteVisits, wpCumulativeStatuses, latestReport, missingReport }) =>
      getCommands({
        project,
        progressComparison:     calculateProgressComparison(project, progress, []),
        prevProgressComparison: null,
        riskScore:              computeProjectRiskScore(project, projReports, progress, projSiteVisits),
        openingReadiness:       computeOpeningReadiness(wpCumulativeStatuses, project.targetOpeningDate),
        latestReport,
        missingReport,
      })
    ),
    [allRows]
  );

  const kpis     = useMemo(() => computePortfolioKpis(projects, allRows, reports), [projects, allRows, reports]);
  const insights = useMemo(() => buildHomeInsights({ rows: allRows, alerts, commands: allCommands, projects }), [allRows, alerts, allCommands, projects]);
  const summary  = useMemo(() => summarizeInsights(insights), [insights]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Home</h1>
          <p>Portfolio overview — today's priorities and health at a glance.</p>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <MorningBrief summary={summary} />
      <PrioritiesToday insights={insights} />
      <PortfolioHealth kpis={kpis} />
    </div>
  );
}

export default Home;
