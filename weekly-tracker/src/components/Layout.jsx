import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import Icon from "./shared/Icon";

function Layout({ children }) {
  // Sidebar is a fixed 240px column on desktop but becomes an off-canvas
  // drawer below 640px (see index.css) — the toggle/backdrop below only
  // render visibly at that breakpoint (CSS-gated), so this state has no
  // effect on desktop layout.
  const [navOpen, setNavOpen] = useState(false);
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (navOpen) {
      wasOpenRef.current = true;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      sidebarRef.current?.querySelector('a')?.focus();
      return () => { document.body.style.overflow = previousOverflow; };
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      toggleRef.current?.focus();
    }
  }, [navOpen]);

  return (
    <div className="app-shell">
      <button
        type="button"
        ref={toggleRef}
        className="mobile-nav-toggle"
        aria-controls="primary-navigation"
        aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={navOpen}
        onClick={() => setNavOpen((open) => !open)}
      >
        <Icon name={navOpen ? 'close' : 'menu'} size={18} />
      </button>
      {navOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar navRef={sidebarRef} mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default Layout;
