// Returns delta between latest and previous week snapshot for a project
export function calculateProgressDelta(currentProgress, historyRows) {
  if (!historyRows || historyRows.length < 2) return null;
  const sorted = [...historyRows].sort((a, b) =>
    new Date(b.recorded_at) - new Date(a.recorded_at)
  );
  const prev = sorted[1].overall_progress ?? 0;
  const delta = currentProgress - prev;
  return {
    delta: +delta.toFixed(1),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    label: delta > 0 ? `↑ +${delta.toFixed(1)}%` : delta < 0 ? `↓ ${delta.toFixed(1)}%` : '→ no change',
  };
}
