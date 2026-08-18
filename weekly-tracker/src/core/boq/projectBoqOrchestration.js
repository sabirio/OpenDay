import { buildProjectBoqRevisionPayload } from '../../domains/boq/projectBoqModel.js';
import { saveProjectBoqRevision } from '../../services/projectBoqService.js';
import { materializeExecutionScopeFromBoq } from '../../services/executionScopeService.js';
import { createClientRequestId } from '../write/writeCommand.js';
import {
  loadProjectBoqs, loadProjectBoqVersions, loadProjectBoqVersionItems,
  loadProjectBoqWorkGroupTotals,
} from '../../services/projectBoqService.js';
import { fetchWorkOntologyVersionById } from '../../services/workOntologyService.js';

export async function loadProjectBoqEditorContext(project, { boqId = null, versionId = null, createId = () => globalThis.crypto.randomUUID() } = {}) {
  if (!project?.id || !project.workOntologyVersionId) {
    const error = new Error('PROJECT_BOQ_REQUIRES_WORK_ONTOLOGY');
    error.code = 'PROJECT_BOQ_REQUIRES_WORK_ONTOLOGY';
    throw error;
  }
  const [ontology, boqs] = await Promise.all([
    fetchWorkOntologyVersionById(project.workOntologyVersionId), loadProjectBoqs(project.id),
  ]);
  const boq = boqs.find(item => item.id === boqId) || boqs[0] || {
    id: createId(), projectId: project.id, ontologyVersionId: project.workOntologyVersionId,
    title: `${project.storeCode || 'Project'} BOQ`, currencyCode: project.currencyCode || 'KZT',
  };
  const versions = boqs.length > 0 ? await loadProjectBoqVersions(boq.id) : [];
  const latestVersion = versions.at(-1) || null;
  const selectedVersion = versions.find(item => String(item.id) === String(versionId)) || latestVersion;
  const [items, workGroupTotals] = selectedVersion
    ? await Promise.all([loadProjectBoqVersionItems(selectedVersion.id), loadProjectBoqWorkGroupTotals(selectedVersion.id)])
    : [[], []];
  return { boq, boqs, versions, latestVersion, selectedVersion, items, workGroupTotals, ontology };
}

export async function commitProjectBoqRevision(projectId, input, { sourceKind = 'NATIVE' } = {}) {
  const payload = buildProjectBoqRevisionPayload(input);
  return saveProjectBoqRevision(projectId, payload, createClientRequestId(), sourceKind);
}

export async function commitBoqExecutionScopeMapping(projectId, boqVersionId, expectedLatestScopeRevision) {
  if (!projectId || !Number.isInteger(boqVersionId) || boqVersionId <= 0
    || !Number.isInteger(expectedLatestScopeRevision) || expectedLatestScopeRevision < 0) {
    const error = new Error('INVALID_BOQ_EXECUTION_SCOPE_COMMAND');
    error.code = 'INVALID_BOQ_EXECUTION_SCOPE_COMMAND';
    throw error;
  }
  return materializeExecutionScopeFromBoq(
    projectId, boqVersionId, expectedLatestScopeRevision, createClientRequestId(),
  );
}
