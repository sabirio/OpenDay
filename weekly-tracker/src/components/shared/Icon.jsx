export default function Icon({ name, size = 16, style }) {
  const paths = {
    search:  <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    close:   <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    warning: <><path d="M12 3 L22 20 H2 Z" /><line x1="12" y1="9" x2="12" y2="14" /><circle cx="12" cy="17.5" r="0.5" fill="currentColor" /></>,
    block:   <><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}
