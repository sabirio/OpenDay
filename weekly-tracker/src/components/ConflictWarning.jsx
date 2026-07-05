/**
 * ConflictWarning — shown when the server has a newer version of the record
 * than what the client loaded (last-write-wins with warning).
 * Props:
 *   serverUpdatedAt: string (ISO)
 *   onOverwrite: () => void  — user chooses to save anyway
 *   onDiscard:   () => void  — user reloads fresh data instead
 */
export default function ConflictWarning({ serverUpdatedAt, onOverwrite, onDiscard }) {
  return (
    <div style={{
      background: 'var(--status-warn-bg)',
      border: '1px solid var(--status-warn)',
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <p style={{ fontWeight: 700, color: 'var(--status-warn)', margin: '0 0 4px', fontSize: 13 }}>
        Conflict: this record was changed by another user
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        Latest server change: {new Date(serverUpdatedAt).toLocaleString()}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onDiscard}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: 'var(--bg-surface)', border: '1px solid var(--status-warn)',
            color: 'var(--status-warn)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          Reload fresh data
        </button>
        <button
          type="button"
          onClick={onOverwrite}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: 'var(--status-warn)', border: 'none',
            color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          Save anyway
        </button>
      </div>
    </div>
  );
}
