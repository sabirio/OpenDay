import { useState, useEffect, useRef } from 'react';

const LEVEL_STYLE = {
  HIGH:   { color: 'var(--status-done)', bg: 'var(--status-done-bg)' },
  MEDIUM: { color: 'var(--status-warn)', bg: 'var(--status-warn-bg)' },
  LOW:    { color: 'var(--text-muted)',  bg: 'var(--bg-elevated)'    },
};

/**
 * Colored pill that opens a breakdown popover on click.
 * Dumb component — all data supplied via `confidence` prop.
 * @param {{ confidence: { level, label, reason, pts, maxPts, breakdown } | null }} props
 */
export default function ConfidenceBadge({ confidence }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey  = e => { if (e.key === 'Escape') setOpen(false); };
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown',   onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown',   onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  if (!confidence) return null;

  const style = LEVEL_STYLE[confidence.level] ?? LEVEL_STYLE.LOW;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        data-testid="confidence-badge"
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`Data confidence: ${confidence.label}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
          color: style.color, background: style.bg,
          border: `1px solid ${style.color}`,
          borderRadius: 10,
          padding: '2px 8px',
          cursor: 'pointer',
          lineHeight: 1.4,
        }}
      >
        ◈ {confidence.label}
      </button>

      {open && (
        <div
          data-testid="confidence-popover"
          role="dialog"
          aria-modal="false"
          aria-label={confidence.label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 200,
            background: 'var(--bg-surface, #1a1a1a)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            width: 248,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {confidence.label}
          </div>

          {confidence.reason && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
              {confidence.reason}
            </p>
          )}

          {confidence.breakdown?.map(b => (
            <div key={b.dimension} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block' }}>{b.dimension}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{b.detail}</span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, marginLeft: 8, whiteSpace: 'nowrap',
                color: b.earned > 0 ? 'var(--status-done)' : 'var(--text-muted)',
              }}>
                {b.earned}/{b.max}
              </span>
            </div>
          ))}

          {confidence.breakdown && (
            <div style={{
              borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                {confidence.pts}/{confidence.maxPts}
              </span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
