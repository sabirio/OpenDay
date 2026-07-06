import { TextBlock } from './shared';

export default function ReportLinksBlock({ report }) {
  if (!report) return null;

  const hasLookAhead = report.nextWeekTop3 || report.weekAfterTop3 || report.delayReason;
  const hasDeclaration = report.pendingIssues || report.finalComments;

  return (
    <div className="weekly-report-links">
      {/* Look Ahead */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text-primary)' }}>Look Ahead</div>
        {hasLookAhead ? (
          <>
            <TextBlock label="Top 3 — Next Week" value={report.nextWeekTop3}  plain />
            <TextBlock label="Top 3 — Week +2"   value={report.weekAfterTop3} plain />
            {report.activitiesBlocked === 'Yes' && (
              <TextBlock label="Delay Reason" value={report.delayReason} plain />
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No look-ahead submitted</div>
        )}
      </div>

      {/* Declaration */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text-primary)' }}>Declaration</div>
        {hasDeclaration ? (
          <>
            <TextBlock label="Pending Issues" value={report.pendingIssues} plain />
            <TextBlock label="Final Comments"  value={report.finalComments} plain />
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>No comments</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <div style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
            background: report.declarationConfirmed ? 'var(--status-done)' : 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confirmed by contractor</span>
        </div>
      </div>
    </div>
  );
}
