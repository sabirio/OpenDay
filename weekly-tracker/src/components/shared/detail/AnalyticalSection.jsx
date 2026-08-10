import { useId } from 'react';

function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export default function AnalyticalSection({
  title,
  description,
  accessory,
  children,
  headingLevel: Heading = 'h3',
  className = '',
  id,
  ruled = true,
  ...props
}) {
  const generatedId = useId();
  const headingId = id || `section-${generatedId.replace(/:/g, '')}`;

  return (
    <section
      className={classes('ds-analytical-section', ruled && 'is-ruled', className)}
      aria-labelledby={title ? headingId : undefined}
      {...props}
    >
      {(title || description || accessory) && (
        <div className="ds-section-heading">
          <div>
            {title && <Heading id={headingId}>{title}</Heading>}
            {description && <p>{description}</p>}
          </div>
          {accessory && <div className="ds-section-accessory">{accessory}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
