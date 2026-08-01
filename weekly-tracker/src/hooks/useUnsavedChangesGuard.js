import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const SENTINEL_MARK = '__unsavedChangesGuard';
const DEFAULT_MESSAGE = 'You have unsaved changes. Leave without saving?';

/**
 * Bounded page-level guard for unsaved Draft state (Simplification Phase
 * 3C.1 goals G+H, extended in 3C.2 for goal covering ordinary SPA
 * navigation). This is the ONE canonical unsaved-changes guard in the
 * repository — no competing pattern exists elsewhere (every other page
 * with a dirty-state warning uses beforeunload only; see this hook's own
 * history for why that alone is insufficient for SPA navigation).
 *
 * Protects three distinct navigation categories:
 *   1. Browser unload (tab close/refresh/typed URL/external link) via
 *      beforeunload.
 *   2. Browser Back/Forward via popstate — React Router intercepts these
 *      without a full page load, so beforeunload alone never fires for
 *      them. Uses a pushState-sentinel technique (see below).
 *   3. Ordinary in-app React Router navigation (<Link>/<NavLink> clicks,
 *      imperative navigate() calls) — these use history.pushState/
 *      replaceState internally, which does NOT fire a popstate event, so
 *      category 2's mechanism cannot see them at all. Guarded instead via
 *      two functions this hook returns: `guardLinkClick(event, to)` (pass
 *      as a <Link>/<NavLink>'s own onClick prop — React Router's Link
 *      always runs a caller-supplied onClick FIRST and only performs its
 *      own navigation if the event was not already defaultPrevented, which
 *      is the officially-supported interception point, not a hack) and
 *      `guardedNavigate(to)` (call instead of a raw navigate() from a
 *      plain button or other imperative trigger).
 *
 * Documented limitation (data router unavailable): this repository's
 * routing is a plain <BrowserRouter>/<Routes> tree (App.jsx), not a data
 * router (createBrowserRouter/RouterProvider) — react-router-dom's
 * useBlocker/unstable_useBlocker requires a data router and is unavailable
 * here. This hook only guards navigation actually wired through
 * guardLinkClick/guardedNavigate on the calling page, plus its own
 * automatic beforeunload/popstate handling — it does not retroactively
 * intercept some other page's or a future Sidebar's unguarded <Link>. Any
 * new navigation control added to a dirty-state-aware page must be wired
 * through one of these two functions explicitly.
 *
 * Documented limitation (orphaned sentinel entry): the popstate sentinel
 * (category 2) is pushed onto history purely to detect Back/Forward and is
 * only unwound automatically when the SAME mechanism detects the deviation
 * (Back press, or this hook's own cleanup while still sitting on its own
 * sentinel). Leaving via guardedNavigate/guardLinkClick instead performs a
 * fresh PUSH navigation on top of that sentinel without unwinding it first
 * (attempting to synchronously unwind it would itself risk a spurious
 * second popstate-triggered confirmation, which is strictly worse) — the
 * practical effect is at most one extra, harmless, same-URL history entry
 * left behind per dirty session that is exited via Link/navigate() rather
 * than Back. It has no data-loss or double-prompt consequence.
 *
 * No autosave: declining to leave never saves on the caller's behalf, it
 * only cancels the pending navigation and leaves the Draft exactly as it
 * was.
 */
export function useUnsavedChangesGuard(dirty, message = DEFAULT_MESSAGE) {
  const dirtyRef = useRef(dirty);
  const navigate = useNavigate();
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

  // Pass as a <Link>/<NavLink>'s onClick prop, e.g.:
  //   <Link to="/x" onClick={(e) => guardLinkClick(e, '/x')}>
  // React Router's Link always calls a caller-supplied onClick before its
  // own navigation logic and skips that navigation if the event was
  // defaultPrevented — the officially-supported interception point.
  // Modified clicks (ctrl/cmd/shift/middle-click — "open in new tab") are
  // deliberately left alone, matching Link's own internal behavior, since
  // a new tab never touches this page's in-memory Draft state.
  const guardLinkClick = useCallback((event, to) => {
    const isModifiedEvent = event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0;
    if (isModifiedEvent || !dirtyRef.current) return;
    event.preventDefault();
    if (window.confirm(message)) navigate(to);
  }, [message, navigate]);

  // Call instead of a raw navigate() from a plain button or other
  // imperative trigger that isn't a real <Link>/<a>.
  const guardedNavigate = useCallback((to) => {
    if (!dirtyRef.current) { navigate(to); return; }
    if (window.confirm(message)) navigate(to);
  }, [message, navigate]);

  return { guardLinkClick, guardedNavigate };
}
