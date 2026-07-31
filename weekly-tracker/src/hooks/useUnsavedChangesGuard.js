import { useEffect, useRef } from 'react';

const SENTINEL_MARK = '__unsavedChangesGuard';
const DEFAULT_MESSAGE = 'You have unsaved changes. Leave without saving?';

/**
 * Bounded page-level guard for unsaved Draft state (Simplification Phase
 * 3C.1, goals G+H). Protects both:
 *   - browser unload (tab close/refresh/typed URL/external link) via
 *     beforeunload;
 *   - this page's own in-app back/forward gesture via popstate — React
 *     Router intercepts browser back/forward without a full page load, so
 *     beforeunload alone never fires for it (the classic SPA back-button
 *     gap this hook exists to close).
 *
 * Documented limitation: this repository's routing is a plain
 * <BrowserRouter>/<Routes> tree (App.jsx), not a data router
 * (createBrowserRouter/RouterProvider) — react-router-dom's
 * useBlocker/unstable_useBlocker requires a data router and is unavailable
 * here. This hook only guards the calling page's own back/forward gesture
 * via a pushState sentinel; it does not intercept a hypothetical future
 * <Link>/navigate() call elsewhere on the same page (Contractor Schedule
 * has none today — it is a standalone route with no in-page nav links). A
 * future page that adds one would need to call this hook's guard
 * explicitly before navigating, or the app would need to migrate to a data
 * router and adopt useBlocker instead of extending this pattern.
 *
 * No autosave: declining to leave never saves on the caller's behalf, it
 * only cancels the pending navigation and leaves the Draft exactly as it
 * was.
 */
export function useUnsavedChangesGuard(dirty, message = DEFAULT_MESSAGE) {
  const dirtyRef = useRef(dirty);
  // Refs must never be written during render (React rule-of-refs) — this
  // effect is the one place dirtyRef is kept in sync, read only later by
  // the event handlers below, never during render.
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const warnUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnUnload);
    return () => window.removeEventListener('beforeunload', warnUnload);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;

    // Sentinel history entry, pushed only while dirty — a clean page never
    // gets an extra entry, so a clean Back press behaves exactly like
    // normal browser navigation with zero interference.
    window.history.pushState({ [SENTINEL_MARK]: true }, '', window.location.href);

    const onPopState = () => {
      if (!dirtyRef.current) return;
      if (window.confirm(message)) {
        // Leave: one further back() undoes the sentinel we pushed, landing
        // on the page the user actually meant to reach. Local Draft state
        // is discarded by the unmount that follows, not by this call.
        window.history.back();
      } else {
        // Stay: re-push the sentinel so a second Back press is guarded
        // again; the URL/route is unchanged, so this is invisible to the
        // user beyond the confirmation dialog itself.
        window.history.pushState({ [SENTINEL_MARK]: true }, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      // Best-effort: when the guard deactivates on its own (Save succeeded,
      // or all edits were discarded) rather than via the user's own Back
      // press, silently pop the sentinel entry we pushed so the history
      // stack returns to its natural depth. Only pops when we can confirm
      // we are still sitting on our own sentinel — never a foreign entry.
      if (window.history.state && window.history.state[SENTINEL_MARK]) {
        window.history.back();
      }
    };
  }, [dirty, message]);
}
