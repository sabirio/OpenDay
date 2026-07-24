import { Link } from 'react-router-dom';
import { useImportWorkflow } from '../../hooks/import/useImportWorkflow.js';
import StepIndicator from '../../components/import/StepIndicator.jsx';
import UploadStep from '../../components/import/UploadStep.jsx';
import MappingStep from '../../components/import/MappingStep.jsx';
import PreviewStep from '../../components/import/PreviewStep.jsx';
import ResultStep from '../../components/import/ResultStep.jsx';

/**
 * ImportProjectsPage — Import is a Portfolio-owned operation (Projects IA
 * v1), not a standalone product module: this page is reached only via the
 * "Import Projects" action on Portfolio (/projects) and always returns
 * there. The certified Import workflow itself (useImportWorkflow + the
 * Upload/Map/Preview/Result steps) is reused completely unchanged.
 */
export default function ImportProjectsPage({ onProjectsChanged }) {
  const workflow = useImportWorkflow();

  // Re-fetch Portfolio's project list (the same loadProjects() App.jsx
  // already uses on login) when leaving Import — Import can create many
  // projects in one commit, so refetching is simpler and more correct than
  // reconstructing full canonical rows from the RPC's bounded per-row
  // outcome summary just to splice them into client state.
  function handleBackToPortfolio() {
    onProjectsChanged?.();
  }

  return (
    <div className="import-page">
      <header className="import-header">
        <Link to="/projects" className="import-back" onClick={handleBackToPortfolio}>
          ← Back to Portfolio
        </Link>
        <h1>Import Projects</h1>
        <p>Upload a historical project spreadsheet, map its columns, review what will happen, then import.</p>
      </header>

      <StepIndicator current={workflow.step} />

      {workflow.step === 'upload' ? (
        <UploadStep
          file={workflow.file}
          parsedFile={workflow.parsedFile}
          parseError={workflow.parseError}
          onUpload={workflow.uploadFile}
        />
      ) : null}

      {workflow.step === 'mapping' && workflow.parsedFile ? (
        <MappingStep
          parsedFile={workflow.parsedFile}
          mapping={workflow.mapping}
          suggestions={workflow.suggestions}
          fieldCatalog={workflow.fieldCatalog}
          missingRequiredFields={workflow.missingRequiredFields}
          onChangeMapping={workflow.setFieldMapping}
          onContinue={workflow.goToPreview}
          onBackToUpload={workflow.goToUpload}
        />
      ) : null}

      {workflow.step === 'preview' && workflow.plan ? (
        <PreviewStep
          plan={workflow.plan}
          previewFilter={workflow.previewFilter}
          onSetFilter={workflow.setPreviewFilter}
          onBackToMapping={workflow.goToMapping}
          onImport={workflow.commitImport}
          commitState={workflow.commitState}
          commitError={workflow.commitError}
        />
      ) : null}

      {workflow.step === 'result' && workflow.result ? (
        <ResultStep
          result={workflow.result}
          resultSummary={workflow.resultSummary}
          onImportAnother={workflow.resetForNewImport}
          onBackToPortfolio={handleBackToPortfolio}
        />
      ) : null}
    </div>
  );
}
