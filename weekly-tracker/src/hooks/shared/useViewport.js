import { useEffect, useState } from 'react';

// Mirrors the snag/plan module's existing `@media (max-width: 760px)`
// breakpoint (src/styles/snags.css, src/styles/plans.css) so the JS-driven
// Mobile Field Mode switch lines up with the CSS that already collapses
// those pages at the same width.
export const FIELD_MODE_BREAKPOINT = 760;

export function useIsMobile(breakpoint = FIELD_MODE_BREAKPOINT) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return isMobile;
}
