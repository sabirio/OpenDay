// Display-only formatting/labels shared by SubmissionSnapshotView.jsx and
// SubmissionHistoryList.jsx (Simplification Phase 4B.2). Kept out of the
// component files themselves so both stay Fast-Refresh-safe (a component
// file may only export components — react-refresh/only-export-components).

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const STATUS_LABEL = {
  PENDING_REVIEW: 'Pending PM Review',
  CHANGES_REQUESTED: 'Changes Requested',
  APPROVED: 'Approved Baseline',
};
