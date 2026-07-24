import { useImportWorkflow } from '../../hooks/import/useImportWorkflow.js';
import StepIndicator from '../../components/import/StepIndicator.jsx';
import UploadStep from '../../components/import/UploadStep.jsx';
import MappingStep from '../../components/import/MappingStep.jsx';
import PreviewStep from '../../components/import/PreviewStep.jsx';
import ResultStep from '../../components/import/ResultStep.jsx';

export default function ImportProjectsPage() {
  const workflow = useImportWorkflow();

  return (
    <div className="import-page">
      <header className="import-header">
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
        />
      ) : null}
    </div>
  );
}
