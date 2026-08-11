import { Link } from 'react-router-dom';
import AttentionSurface from '../shared/detail/AttentionSurface.jsx';
import { getAttentionInsights, getInsightDisplayTitle, getPortfolioState } from './homePresentation.js';

function MorningBrief({ summary, insights, projects, projectCount }) {
  const { critical, warning, info, total } = summary;
  const portfolioState = getPortfolioState(projectCount, total);
  const primary = getAttentionInsights(insights)[0];
  const attentionCount = critical + warning;

  if (portfolioState === 'empty') {
    return (
      <AttentionSurface
        title="No projects yet"
        description="Add a project to begin an operational briefing."
        tone="calm"
        headingLevel="h2"
      />
    );
  }

  if (!primary) {
    return (
      <AttentionSurface
        title="No attention required"
        description={portfolioState === 'healthy'
          ? 'All clear — no issues detected across the portfolio.'
          : `${info} informational ${info === 1 ? 'update is' : 'updates are'} available in the specialist workspaces.`}
        accessory="All clear"
        tone="calm"
        headingLevel="h2"
      />
    );
  }

  const title = getInsightDisplayTitle(primary, projects);
  return (
    <AttentionSurface
      title={primary.projectId ? (
        <Link className="home-attention-title-link" to={`/?project=${primary.projectId}`}>{title}</Link>
      ) : title}
      description={primary.detail}
      accessory={`${attentionCount} ${attentionCount === 1 ? 'item' : 'items'}`}
      headingLevel="h2"
    />
  );
}

export default MorningBrief;
