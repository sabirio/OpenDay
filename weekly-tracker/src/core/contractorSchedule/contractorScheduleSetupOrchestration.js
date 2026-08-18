import {
  fetchContractorScheduleSetup,
  saveContractorScheduleSetup,
} from '../../services/contractorScheduleService.js';
import { createClientRequestId } from '../write/writeCommand.js';

export function loadContractorScheduleSetup(projectId) {
  return fetchContractorScheduleSetup(projectId);
}

export function commitContractorScheduleSetup(projectId, executionScopeVersionId, activities) {
  return saveContractorScheduleSetup(
    projectId,
    executionScopeVersionId,
    activities,
    createClientRequestId(),
  );
}
