function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'embedded',
  className = '',
  as: Element = 'div',
  ...props
}) {
  return (
    <Element className={classes('ds-empty-state', `size-${size}`, className)} {...props}>
      {icon && <div className="ds-empty-state-icon" aria-hidden="true">{icon}</div>}
      <div className="ds-empty-state-copy">
        {title && <h3>{title}</h3>}
        {description && <p>{description}</p>}
      </div>
      {action && <div className="ds-empty-state-action">{action}</div>}
    </Element>
  );
}
