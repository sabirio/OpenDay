export default function Icon({ name, size = 16, style, className }) {
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

    // -- Navigation glyphs (Phase 2: shell/Sidebar) --------------------------
    home:      <><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5" /><path d="M10 21v-6h4v6" /></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    folder:    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />,
    fileText:  <><path d="M7 3h6l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M13 3v5h5" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></>,
    flag:      <><line x1="5" y1="3" x2="5" y2="21" /><path d="M5 4h11l-2 4 2 4H5" /></>,
    hardHat:   <><path d="M4 15a8 8 0 0 1 16 0" /><path d="M2 15h20" /><path d="M12 6.5v3.5" /></>,
    mapPin:    <><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></>,
    listChecks: <><circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" /><line x1="9" y1="6" x2="20" y2="6" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><line x1="9" y1="12" x2="20" y2="12" /><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" /><line x1="9" y1="18" x2="20" y2="18" /></>,
    shield:    <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3Z" />,
    scale:     <><line x1="12" y1="3" x2="12" y2="21" /><path d="M5 7h6M13 7h6" /><path d="M5 7l-3.2 6a3.2 3.2 0 0 0 6.4 0Z" /><path d="M19 7l-3.2 6a3.2 3.2 0 0 0 6.4 0Z" /><line x1="8" y1="21" x2="16" y2="21" /></>,
    users:     <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" /><circle cx="17.2" cy="8.5" r="2.6" /><path d="M15.7 14.2c2.7.4 4.5 2.4 4.5 5.3" /></>,
    briefcase: <><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" /><line x1="3" y1="12.5" x2="21" y2="12.5" /></>,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    menu:      <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>,
    logout:    <path d="M15 7l5 5-5 5M20 12H9M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
         stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}
