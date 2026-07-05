function Glyph({ name, size = 14 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "alert":    return (<svg {...common}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>);
    case "block":    return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>);
    case "calendar": return (<svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
    case "check":    return (<svg {...common}><path d="M20 6 9 17l-5-5"/></svg>);
    case "arrowUp":  return (<svg {...common}><path d="M12 19V5M5 12l7-7 7 7"/></svg>);
    case "doc":      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>);
    case "search":   return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>);
    default: return null;
  }
}

export default Glyph;
