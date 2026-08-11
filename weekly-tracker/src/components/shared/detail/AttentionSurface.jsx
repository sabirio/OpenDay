import { useId } from 'react';

function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export default function AttentionSurface({
  title,
  description,
  accessory,
  children,
  tone = 'attention',
  headingLevel: Heading = 'h3',
  className = '',
  id,
  as: Element = 'section',
  ...props
}) {
  const generatedId = useId();
  const headingId = id || `attention-${generatedId.replace(/:/g, '')}`;

  return (
    <Element
      className={classes('ds-attention-surface', `tone-${tone}`, className)}
      aria-labelledby={title ? headingId : undefined}
      {...props}
    >
      {(title || description || accessory) && (
        <div className="ds-attention-heading">
          <div>
            {title && <Heading id={headingId}>{title}</Heading>}
            {description && <p>{description}</p>}
          </div>
          {accessory && <div className="ds-attention-accessory">{accessory}</div>}
        </div>
      )}
      {children}
    </Element>
  );
}
