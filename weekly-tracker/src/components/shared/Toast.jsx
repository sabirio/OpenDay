import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// Shared feedback primitive. UX-audit fix (2026-07-21): the app previously
// had no consistent way to tell a user an action succeeded or failed —
// Projects.jsx used native alert() (jarring, and only for errors, so a
// successful save and a slow no-op looked identical until the modal
// closed), WeeklyReports' Gantt-resize failure was console.error-only
// (fully silent to the user). One shared component instead of N ad hoc
// patterns.

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    setToasts(current => current.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const show = useCallback((message, { tone = 'neutral', duration = 5000 } = {}) => {
    const id = nextId++;
    setToasts(current => [...current, { id, message, tone }]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    show,
    success: (message, opts) => show(message, { tone: 'success', ...opts }),
    error:   (message, opts) => show(message, { tone: 'error', duration: 8000, ...opts }),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span>{t.message}</span>
            <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** @returns {{ show: (message: string, opts?: {tone?: 'neutral'|'success'|'error', duration?: number}) => number, success: (message: string, opts?: object) => number, error: (message: string, opts?: object) => number }} */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be called within <ToastProvider>');
  return ctx;
}
