import { useMemo } from 'react';
import { useAllRows } from '../hooks/useAllRows';
import { useGanttMetrics } from '../hooks/useGanttMetrics';
import { computePortfolioAlerts, computePortfolioKpis } from '../engines/portfolioEngine';
import { getCommands } from '../engines/commandEngine';
import { buildHomeInsights, summarizeInsights } from '../core/insights/selectors/homeInsights';
import MorningBrief    from '../components/home/MorningBrief';
import PrioritiesToday from '../components/home/PrioritiesToday';
import PortfolioHealth from '../components/home/PortfolioHealth';

function Home({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  const allRows     = useAllRows(projects, reports, siteVisits, templatesById, activeTemplateFallback);
  const ganttMetrics = useGanttMetrics(projects);

  const ganttRows = useMemo(() =>
    allRows.map(row => ({ ...row, gantt: ganttMetrics.get(row.project.id) || null }))
  , [allRows, ganttMetrics]);

  const alerts = useMemo(() => computePortfolioAlerts(ganttRows), [ganttRows]);

  const allCommands = useMemo(() =>
    // readiness comes straight off the row — evaluateProjectState() already
    // computed it once, scoped to this project's actual work packages
    // (getScopeWPIds). Recomputing it here without that scope previously
    // flagged out-of-scope blocker WPs (never reported on, so always read as
    // "Not Started") as still blocking, even for projects that were ahead of
    // schedule and 100% clear everywhere else in the app.
    allRows.flatMap(({ project, riskScore, readiness, latestReport, missingReport, progressComparison, prevProgressComparison }) =>
      getCommands({
        project,
        progressComparison,
        prevProgressComparison,
        riskScore,
        openingReadiness: readiness,
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
          <p>Your daily focus — today's priorities and portfolio health at a glance.</p>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <PortfolioHealth kpis={kpis} />
      <MorningBrief summary={summary} />
      <PrioritiesToday insights={insights} />
    </div>
  );
}

export default Home;
