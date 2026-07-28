import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal-dialog shell — backdrop + panel with `role="dialog"`,
 * `aria-modal`, initial focus, Tab/Shift+Tab containment, Escape-to-close,
 * backdrop-click-to-close, focus return to whatever triggered the modal on
 * unmount, and background scroll lock. Purely behavioral: callers keep
 * their own panel styling/className/content unchanged.
 *
 * `isDirty`: when true, Escape and backdrop click ask for confirmation
 * instead of closing silently (native `window.confirm` — deliberately not
 * a second custom dialog, to avoid a recursive accessibility problem and
 * keep this a targeted fix rather than a new design surface).
 */
export default function Modal({
  children,
  onClose,
  titleId,
  isDirty = false,
  dirtyMessage = "Discard unsaved changes?",
  className = "modal",
  overlayClassName = "modal-overlay",
  style,
  testId,
}) {
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Mount/unmount only: grab initial focus, lock background scroll, and
  // restore focus to whatever triggered the modal on close. This must NOT
  // re-run on every render — callers routinely pass an inline onClose
  // (a fresh function identity every render) and a freshly-computed isDirty
  // boolean, so depending on those here previously stole focus back to the
  // first focusable element (typically the close button) on every keystroke
  // inside the modal, since typing in a controlled field re-renders the
  // caller and therefore this Modal on every character.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  // Separate effect for Escape/Tab handling: this one legitimately needs the
  // current onClose/isDirty/dirtyMessage on every keystroke-triggered
  // re-render, but re-subscribing a keydown listener (unlike the effect
  // above) doesn't touch focus or scroll state, so it's safe for this one to
  // re-run every render.
  useEffect(() => {
    function requestClose() {
      if (isDirty && !window.confirm(dirtyMessage)) return;
      onClose();
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = [...panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isDirty, dirtyMessage]);

  function handleBackdropClick() {
    if (isDirty && !window.confirm(dirtyMessage)) return;
    onClose();
  }

  return (
    <>
      <div className={overlayClassName} onClick={handleBackdropClick} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={className}
        style={style}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
