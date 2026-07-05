export default function Icon({ name, size = 16, style }) {
  const paths = {
    search:  <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    close:   <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    warning: <><path d="M12 3 L22 20 H2 Z" /><line x1="12" y1="9" x2="12" y2="14" /><circle cx="12" cy="17.5" r="0.5" fill="currentColor" /></>,
    block:   <><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></>,
    camera:  <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="14" r="3.5" /></>,
    spinner: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
    user:    <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
    clock:   <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    arrowRight: <><line x1="4" y1="12" x2="20" y2="12" /><path d="M14 6l6 6-6 6" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}
