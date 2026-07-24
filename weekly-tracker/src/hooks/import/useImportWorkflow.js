import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  parseUploadedFile, suggestInitialMapping, getMissingRequiredFields, getFieldCatalog,
  generatePlan, describeCommitError, summarizeResult,
} from '../../core/importWorkflow/importWorkflowModel.js';
import { fetchExistingProjectIdentities, commitPlan } from '../../core/importWorkflow/importWorkflowIO.js';

// Re-exported so components can format/label values without ever importing
// core/ directly (architecture guard: pages/components reach core only via
// a hooks/use*.js module — same pattern as hooks/usePhotoUpload.js).
export { describeRowStatus, describeLocation, describeMoney, describeDate, describeCommitOutcome } from '../../core/importWorkflow/importWorkflowModel.js';

const FIELD_CATALOG = getFieldCatalog(); // static catalog, computed once per module load

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsArrayBuffer(file);
  });
}

function newClientRequestId() {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const INITIAL_STATE = {
  step: 'upload',
  file: null,
  parsedFile: null,
  parseError: null,
  mapping: {},
  suggestions: [],
  plan: null,
  planLoading: false,
  planError: null,
  previewFilter: 'all',
  commitState: 'idle', // idle | committing | error
  commitError: null,
  result: null,
  resultSummary: null,
};

/**
 * useImportWorkflow — the one state machine for the Import Projects page.
 * Orchestration only: every decision (parsing, mapping suggestions, CREATE/
 * SKIP/BLOCK planning, committing) is delegated to importWorkflowModel.js,
 * which itself delegates to the frozen core/import/* engine and the trusted
 * commit RPC. This hook never normalizes, validates, or decides an outcome.
 */
export function useImportWorkflow() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const [state, setState] = useState(INITIAL_STATE);
  const clientRequestIdRef = useRef(newClientRequestId());
  const committingRef = useRef(false); // synchronous guard — React state updates are not synchronous enough to prevent a fast double-click alone

  const uploadFile = useCallback(async (file) => {
    setState(prev => ({ ...prev, file: { name: file.name, size: file.size }, parseError: null }));
    let data;
    try {
      data = await readFileAsArrayBuffer(file);
    } catch (err) {
      setState(prev => ({ ...prev, parseError: { errorCode: 'UNREADABLE_FILE', errorMessage: 'This file could not be read.', detail: err?.message } }));
      return;
    }
    const parsed = parseUploadedFile({ filename: file.name, data });
    if (!parsed.ok) {
      setState(prev => ({ ...prev, parsedFile: null, parseError: parsed }));
      return;
    }
    const suggestions = suggestInitialMapping(parsed.headers);
    const mapping = {};
    for (const suggestion of suggestions) {
      if (suggestion.suggestedField) mapping[suggestion.header] = suggestion.suggestedField;
    }
    setState(prev => ({
      ...prev, parsedFile: parsed, parseError: null, suggestions, mapping,
      step: 'mapping', plan: null, result: null,
    }));
  }, []);

  const setFieldMapping = useCallback((header, fieldKey) => {
    setState(prev => ({ ...prev, mapping: { ...prev.mapping, [header]: fieldKey || null } }));
  }, []);

  const goToMapping = useCallback(() => {
    setState(prev => ({ ...prev, step: 'mapping' }));
  }, []);

  const goToUpload = useCallback(() => {
    setState(prev => ({ ...prev, step: 'upload' }));
  }, []);

  const goToPreview = useCallback(async () => {
    setState(prev => ({ ...prev, planLoading: true, planError: null }));
    try {
      const existingProjects = await fetchExistingProjectIdentities(companyId);
      setState(prev => {
        const plan = generatePlan({ headers: prev.parsedFile.headers, rows: prev.parsedFile.rows, mapping: prev.mapping, existingProjects });
        return { ...prev, plan, planLoading: false, step: 'preview', previewFilter: 'all' };
      });
    } catch (err) {
      setState(prev => ({ ...prev, planLoading: false, planError: err?.message || 'Could not check existing projects.' }));
    }
  }, [companyId]);

  const setPreviewFilter = useCallback((filter) => {
    setState(prev => ({ ...prev, previewFilter: filter }));
  }, []);

  const commitImport = useCallback(async (plan, file, mapping) => {
    if (committingRef.current || !plan) return; // guards accidental double-submit, independent of React's render timing
    committingRef.current = true;
    setState(prev => ({ ...prev, commitState: 'committing', commitError: null }));
    try {
      const response = await commitPlan({
        companyId,
        planRows: plan.rows, // verbatim — never filtered/converted
        clientRequestId: clientRequestIdRef.current,
        sourceFilename: file?.name,
        mappingSnapshot: mapping,
      });
      setState(prev => ({ ...prev, commitState: 'idle', result: response, resultSummary: summarizeResult(response), step: 'result' }));
    } catch (err) {
      setState(prev => ({ ...prev, commitState: 'error', commitError: describeCommitError(err) }));
    } finally {
      committingRef.current = false;
    }
  }, [companyId]);

  const resetForNewImport = useCallback(() => {
    clientRequestIdRef.current = newClientRequestId();
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    companyId,
    fieldCatalog: FIELD_CATALOG,
    uploadFile,
    setFieldMapping,
    goToMapping,
    goToUpload,
    goToPreview,
    setPreviewFilter,
    commitImport: () => commitImport(state.plan, state.file, state.mapping),
    resetForNewImport,
    missingRequiredFields: state.mapping ? getMissingRequiredFields(state.mapping) : [],
  };
}
