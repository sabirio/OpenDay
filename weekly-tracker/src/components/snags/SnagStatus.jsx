export function SnagStatus({status,label,tone='neutral'}){return <span className={`snag-status snag-status-${tone}`}>{label||status}</span>}
export function SnagPriority({priority,label}){return <span className={`snag-priority snag-priority-${String(priority).toLowerCase()}`}>{label||priority}</span>}
