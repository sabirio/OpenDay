import { useRef, useState } from 'react';
import Icon from '../shared/Icon.jsx';
import DownloadTemplateButton from './DownloadTemplateButton.jsx';

export default function UploadStep({ file, parsedFile, parseError, onUpload }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList) {
    const picked = fileList?.[0];
    if (picked) onUpload(picked);
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        type="button"
        className={`import-dropzone${dragOver ? ' import-dropzone--dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer?.files);
        }}
      >
        <Icon name="camera" size={28} style={{ opacity: 0.6 }} />
        <div>
          <strong>Drag an Excel or CSV file here</strong>
          <div>or choose a file</div>
        </div>
        <span className="btn btn-primary" aria-hidden="true">Choose file</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        aria-label="Choose historical projects file"
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      <DownloadTemplateButton />

      {parseError ? (
        <div className="import-alert import-alert--danger" role="alert">
          <Icon name="warning" size={18} />
          <div>
            <strong>{parseError.errorMessage}</strong>
          </div>
        </div>
      ) : null}

      {file && parsedFile ? (
        <div className="import-file-summary">
          <span><strong>File:</strong> {file.name}</span>
          <span><strong>Sheet:</strong> {parsedFile.sheetName}</span>
          <span><strong>Rows:</strong> {parsedFile.rows.length}</span>
          <span><strong>Columns:</strong> {parsedFile.headers.length}</span>
        </div>
      ) : null}
    </div>
  );
}
