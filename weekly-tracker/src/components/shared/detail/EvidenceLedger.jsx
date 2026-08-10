function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export default function EvidenceLedger({
  items,
  children,
  columns = 1,
  density = 'default',
  layout = 'rows',
  contained = false,
  className = '',
  'aria-label': ariaLabel,
  ...props
}) {
  return (
    <dl
      className={classes(
        'ds-evidence-ledger',
        `is-${layout}`,
        `density-${density}`,
        contained && 'is-contained',
        className,
      )}
      style={{ '--evidence-columns': columns }}
      aria-label={ariaLabel}
      {...props}
    >
      {items?.map((item) => (
        <div className="ds-evidence-entry" key={item.key ?? item.label}>
          <dt>{item.label}</dt>
          <dd>
            <strong>{item.value}</strong>
            {item.secondary && <span>{item.secondary}</span>}
            {item.timestamp && <time dateTime={item.dateTime}>{item.timestamp}</time>}
          </dd>
          {item.accessory && <div className="ds-evidence-accessory">{item.accessory}</div>}
        </div>
      ))}
      {children}
    </dl>
  );
}
