import { useState } from 'react';

export default function ExpandableTextBlock({ label, value, plain = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;

  return (
    <div className="weekly-expandable-text">
      <div className="weekly-expandable-label">{label}</div>
      <div className={expanded ? 'weekly-expandable-body is-expanded' : 'weekly-expandable-body'}>
        {plain ? <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span> : value}
      </div>
      <button type="button" onClick={() => setExpanded(v => !v)}>
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
