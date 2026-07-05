const ACCENT = "#0891b2";

// TODO wave7: this recalculates discrepancy inline instead of reading
// savedVisit.discrepancies (the result siteVisitService.submitSiteVisit()
// already computed and persisted to the DB). It also uses a different
// tolerance (PROGRESS_TOL = 5 below) than that service's threshold (10/20),
// so this can show a different discrepancy count than what was actually
// written. Canonical source: siteVisitService.submitSiteVisit() (per-visit
// discrepancy) — see src/engines/COMPARISON_MODEL.md.
// Do not add new comparison logic here; this should be replaced with a
// read from savedVisit.discrepancies.
function GanttSuccessView({ project, form, ganttTasks, pmWpObservations, onNewVisit }) {
  // Status-rank comparison: Delayed/Blocked below Not Started, so marking a task
  // as Delayed when GC claimed In Progress registers as a discrepancy even if progress % didn't change.
  const STATUS_RANK = { completed: 2, in_progress: 1, not_started: 0, delayed: -1, blocked: -2 };
  let confirmed = 0, discrepancyCount = 0, pmAheadCount = 0;
  for (const task of ganttTasks) {
    const gcStatus   = task.status ?? 'not_started';
    const gcProgress = task.actual_progress ?? 0;

    // Skip tasks GC hasn't touched at all
    if (gcStatus === 'not_started' && gcProgress === 0) continue;

    const pmEntry  = pmWpObservations[task.id] || {};
    const pmStatus     = pmEntry.observed_status ?? gcStatus;
    const gcRank       = STATUS_RANK[gcStatus] ?? 0;
    const pmRank       = STATUS_RANK[pmStatus] ?? 0;
    const pmProgress   = pmEntry.observed_progress ?? gcProgress;
    const PROGRESS_TOL = 5;

    if (pmRank === gcRank) {
      const d = pmProgress - gcProgress;
      if      (d < -PROGRESS_TOL) discrepancyCount++;
      else if (d >  PROGRESS_TOL) pmAheadCount++;
      else                        confirmed++;
    } else if (pmRank < gcRank) {
      discrepancyCount++;
    } else {
      pmAheadCount++;
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f7fa', padding: '36px 20px 80px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#e0f2fe', border: '2px solid #7dd3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0c4a6e', marginBottom: 8 }}>Site Visit Recorded</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
            {project.storeCode} · {project.shoppingMallName} · {form.visitDate}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
            {[
              { label: '✓ Confirmed',   value: confirmed,        color: '#16a34a', bg: '#dcfce7' },
              { label: '⚠ Discrepancy', value: discrepancyCount, color: '#dc2626', bg: '#fee2e2' },
              { label: '↑ PM Ahead',    value: pmAheadCount,     color: '#d97706', bg: '#fef3c7' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 8px' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={onNewVisit}
            style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${ACCENT}, #06b6d4)`, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginRight: 12 }}>
            New Visit
          </button>
          <button type="button" onClick={() => window.history.back()}
            style={{ padding: '12px 28px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', color: '#6b7280', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default GanttSuccessView;
