function MorningBrief({ summary }) {
  const { critical, warning, total } = summary;

  let message;
  if (total === 0) {
    message = 'All clear — no issues detected across the portfolio.';
  } else {
    const parts = [];
    if (critical > 0) parts.push(`${critical} critical`);
    if (warning  > 0) parts.push(`${warning} need attention`);
    message = parts.join(', ') + '.';
  }

  const color = critical > 0
    ? 'var(--status-alert)'
    : warning > 0
      ? 'var(--status-warn)'
      : 'var(--status-done)';

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
