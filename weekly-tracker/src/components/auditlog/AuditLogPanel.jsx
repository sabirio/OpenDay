import { useProjectAuditLog } from '../../hooks/useProjectAuditLog';
import Icon from '../shared/Icon';

const ACTION_STYLE = {
  INSERT: { bg: 'var(--status-done-bg)', color: 'var(--status-done)' },
  UPDATE: { bg: 'var(--accent-subtle)', color: 'var(--accent)' },
  DELETE: { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)' },
};

const TABLE_LABEL = {
  contractor_reports: 'Contractor Report',
  site_visits:        'Site Visit',
  projects:           'Project',
};

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function AuditLogPanel({ projectId }) {
  const { logs, loading, error } = useProjectAuditLog(projectId);

  if (loading) return <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 16 }}>Loading audit log…</p>;
  if (error) return <p style={{ fontSize: 13, color: 'var(--status-alert)', padding: 16 }}>{error}</p>;
  if (!logs.length) return <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 16 }}>No changes recorded yet.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 384, overflowY: 'auto' }}>
      {logs.map(log => {
        const style = ACTION_STYLE[log.action] || ACTION_STYLE.UPDATE;
        const diffEntries = log.diff ? Object.entries(log.diff) : [];
        return (
          <div key={`${log.table_name}-${log.id}`} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--accent-subtle)', borderRadius: 10, fontSize: 13 }}>
            <span style={{
              height: 'fit-content', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: style.bg, color: style.color,
            }}>
              {log.action}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {TABLE_LABEL[log.table_name] ?? log.table_name}
                </span>
                <Icon name="user" size={12} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                  {log.changed_by ? log.changed_by.slice(0, 8) : '—'}
                </span>
                <Icon name="clock" size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                <span style={{ flexShrink: 0 }}>
                  {new Date(log.changed_at).toLocaleString()}
                </span>
              </div>

              {diffEntries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {diffEntries.map(([field, change]) => (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{field}:</span>
                      <span style={{ color: 'var(--status-alert)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                        {formatValue(change.from)}
                      </span>
                      <Icon name="arrowRight" size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--status-done)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                        {formatValue(change.to)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
