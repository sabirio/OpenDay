import { useState, useEffect, useRef } from 'react';
import { HELP_CONTENT } from '../../help/helpContent.js';

/**
 * Inline icon-button that reveals a popover with scoring breakdown.
 * @param {{ topic: string, breakdown?: Array, pts?: number, maxPts?: number }} props
 */
export default function InfoTip({ topic, breakdown, pts, maxPts }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const content = HELP_CONTENT[topic];
  if (!content) return null;

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        data-testid="infotip-trigger"
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`Help: ${content.title}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, lineHeight: 1,
          padding: '0 3px', display: 'inline-flex', alignItems: 'center',
        }}
      >
        ⓘ
      </button>

      {open && (
        <div
          data-testid="infotip-popover"
          role="dialog"
          aria-modal="false"
          aria-label={content.title}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
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
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
            {content.title}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            {content.body}
          </p>

          {breakdown && breakdown.map(b => (
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

          {breakdown && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{pts}/{maxPts}</span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
