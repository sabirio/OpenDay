import { fmtDateTime, STATUS_LABEL } from './scheduleSubmissionDisplay.js';

/**
 * Minimal submission history list (Simplification Phase 4B.2 Section M) —
 * shown only when more than one submission exists. The current working
 * Draft is never listed here: DRAFT is not a project_schedule_versions row
 * (Phase 4A/4B.1 storage model), so there is nothing to select for it.
 */
export default function SubmissionHistoryList({ versions, selectedVersionId, onSelect }) {
  if (!versions || versions.length < 2) return null;

  const sorted = [...versions].sort((a, b) => b.submissionNumber - a.submissionNumber);

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Submission history
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sorted.map((v) => {
          const isSelected = String(v.id) === String(selectedVersionId);
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                aria-current={isSelected ? 'true' : undefined}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--border)',
                  background: isSelected ? 'var(--accent-subtle)' : 'transparent', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  Submission #{v.submissionNumber} — {STATUS_LABEL[v.status] || v.status}
                  {v.status === 'APPROVED' && v.baselineRevisionNumber ? ` · Baseline v${v.baselineRevisionNumber}` : ''}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDateTime(v.reviewedAt || v.submittedAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
