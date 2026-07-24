import { Fragment } from 'react';
import Icon from '../shared/Icon.jsx';

function mappingTag(header, mapping, suggestions) {
  const current = mapping[header] || null;
  const suggestion = suggestions.find(s => s.header === header)?.suggestedField || null;
  if (!current) return { text: 'Ignored', className: 'import-mapping-tag--ignored' };
  if (current === suggestion) return { text: 'Suggested', className: 'import-mapping-tag--suggested' };
  return { text: 'Manual', className: 'import-mapping-tag--manual' };
}

export default function MappingStep({ parsedFile, mapping, suggestions, fieldCatalog, missingRequiredFields, onChangeMapping, onContinue, onBackToUpload }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Match each column from your file to an OpenDay field, or leave it ignored. Suggested matches are already selected — change any that are wrong.
      </p>

      <div className="import-mapping-grid">
        <span className="import-mapping-header">Excel column</span>
        <span className="import-mapping-header">OpenDay field</span>
        <span className="import-mapping-header" />
        {parsedFile.headers.map((header, index) => {
          const tag = mappingTag(header, mapping, suggestions);
          // Header text is arbitrary spreadsheet content (may contain spaces/
          // punctuation) and is never a valid HTML id on its own — index-based
          // id for the label/select pairing; data-header carries the raw
          // header text for anything (tests, debugging) that needs to target
          // a specific column by name.
          const selectId = `import-mapping-select-${index}`;
          return (
            <Fragment key={header}>
              <label className="import-mapping-source" htmlFor={selectId}>{header}</label>
              <select
                id={selectId}
                data-header={header}
                className="ds-select"
                value={mapping[header] || ''}
                onChange={(e) => onChangeMapping(header, e.target.value || null)}
              >
                <option value="">Ignore this column</option>
                {fieldCatalog.map(field => (
                  <option key={field.key} value={field.key}>{field.label}{field.required ? ' (required)' : ''}</option>
                ))}
              </select>
              <span className={`import-mapping-tag ${tag.className}`}>{tag.text}</span>
            </Fragment>
          );
        })}
      </div>

      {missingRequiredFields.length > 0 ? (
        <div className="import-alert import-alert--warning" role="alert">
          <Icon name="warning" size={18} />
          <div>
            <strong>Map these required fields before continuing:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {missingRequiredFields.map(field => <li key={field.key}>{field.label}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-ghost" onClick={onBackToUpload}>Back</button>
        <button type="button" className="btn btn-primary" disabled={missingRequiredFields.length > 0} onClick={onContinue}>
          Review {parsedFile.rows.length} projects
        </button>
      </div>
    </div>
  );
}
