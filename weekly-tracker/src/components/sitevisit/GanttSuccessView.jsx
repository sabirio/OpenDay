const ACCENT = "var(--field-accent-sitevisit)";

// P2.2: reads savedVisit.discrepancies — the exact result
// siteVisitService.submitSiteVisit() computed and persisted to
// site_visit_wps/site_visit_discrepancies — instead of recalculating
// inline. Previously this recomputed with its own STATUS_RANK/tolerance
// logic (PROGRESS_TOL = 5) that didn't match the service's actual
// threshold (10/20), so this screen could show a different discrepancy
// count than what was actually written to the DB. Canonical source:
// siteVisitService.submitSiteVisit() — see src/engines/COMPARISON_MODEL.md.
function GanttSuccessView({ project, form, ganttTasks, discrepancies = [], onNewVisit }) {
  // discrepancies[] includes every task with ANY nonzero delta, even ones the
  // service itself classifies 'ok' (< 10pp — its own tolerance band). Only
  // 'warning'/'critical' entries count as a real discrepancy/pmAhead here;
  // 'ok' entries fold into "confirmed" alongside exact matches, reusing the
  // service's own threshold rather than inventing a second one on this screen.
  // signedDelta < 0: PM found LESS progress than the contractor claimed
  // (overstatement). signedDelta > 0: PM found MORE (contractor understated).
  const flagged          = discrepancies.filter(d => d.status !== 'ok');
  const discrepancyCount = flagged.filter(d => d.signedDelta < 0).length;
  const pmAheadCount     = flagged.filter(d => d.signedDelta > 0).length;
  const confirmed        = Math.max(0, ganttTasks.length - flagged.length);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--field-bg-sitevisit)', padding: '36px 20px 80px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--field-border)', padding: '32px 28px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--field-info-bg)', border: '2px solid var(--field-info-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--field-info-fg-dark)', marginBottom: 8 }}>Site Visit Recorded</div>
          <div style={{ fontSize: 13, color: 'var(--field-text-secondary)', marginBottom: 24 }}>
            {project.storeCode} · {project.shoppingMallName} · {form.visitDate}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
            {[
              { label: '✓ Confirmed',   value: confirmed,        color: 'var(--field-success-fg)', bg: 'var(--field-success-bg)', testId: 'summary-confirmed' },
              { label: '⚠ Discrepancy', value: discrepancyCount, color: 'var(--field-danger-fg)', bg: 'var(--field-danger-bg)', testId: 'summary-discrepancy' },
              { label: '↑ PM Ahead',    value: pmAheadCount,     color: 'var(--field-warning-fg)', bg: 'var(--field-warning-bg)', testId: 'summary-pm-ahead' },
            ].map(({ label, value, color, bg, testId }) => (
              <div key={label} data-testid={testId} style={{ background: bg, borderRadius: 10, padding: '14px 8px' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={onNewVisit}
            style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${ACCENT}, var(--field-accent-sitevisit-2))`, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginRight: 12 }}>
            New Visit
          </button>
          <button type="button" onClick={() => window.history.back()}
            style={{ padding: '12px 28px', borderRadius: 10, border: '1px solid var(--field-border-strong)', background: 'white', color: 'var(--field-text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default GanttSuccessView;
