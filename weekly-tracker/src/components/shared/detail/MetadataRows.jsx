function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export default function MetadataRows({
  items,
  children,
  columns = 1,
  density = 'default',
  layout = 'grid',
  className = '',
  'aria-label': ariaLabel,
  ...props
}) {
  return (
    <dl
      className={classes('ds-metadata-rows', `is-${layout}`, `density-${density}`, className)}
      style={{ '--metadata-columns': columns }}
      aria-label={ariaLabel}
      {...props}
    >
      {items?.map((item) => (
        <div className="ds-metadata-row" key={item.key ?? item.label}>
          {item.label && <dt>{item.label}</dt>}
          <dd>
            <span className="ds-metadata-value">{item.value}</span>
            {item.secondary && <span className="ds-metadata-secondary">{item.secondary}</span>}
          </dd>
          {item.accessory && <div className="ds-metadata-accessory">{item.accessory}</div>}
        </div>
      ))}
      {children}
    </dl>
  );
}
