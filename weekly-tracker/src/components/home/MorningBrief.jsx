import { TONE, severityTone, getPortfolioState } from './homePresentation.js';

function MorningBrief({ summary, projectCount }) {
  const { critical, warning, total } = summary;
  const portfolioState = getPortfolioState(projectCount, total);

  let message;
  let color;
  if (portfolioState === 'empty') {
    message = 'No projects yet — add a project to start tracking priorities.';
    color = TONE.muted;
  } else if (portfolioState === 'healthy') {
    message = 'All clear — no issues detected across the portfolio.';
    color = TONE.done;
  } else {
    const parts = [];
    if (critical > 0) parts.push(`${critical} critical`);
    if (warning  > 0) parts.push(`${warning} need attention`);
    message = parts.join(', ') + '.';
    color = severityTone({ critical, warning });
  }

  return (
    <div style={{
      padding: '14px 18px',
      background: 'var(--bg-elevated)',
      border: `1.5px solid ${color}`,
      borderRadius: 10,
      marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Morning Brief
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
        {message}
      </div>
    </div>
  );
}

export default MorningBrief;
