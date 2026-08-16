import { WORK_ONTOLOGY_SCHEMA_VERSION } from './workOntologyContract.js';

export const RETAIL_FITOUT_ONTOLOGY_V1_ID = 'de782297-1166-41da-8f21-e3deef6609a7';
export const CONSTRUCTION_DEPARTMENT_ID = 'd1000000-0000-4000-8000-000000000001';
export const ELECTRICAL_DISCIPLINE_ID = '76bee53d-a3b1-4646-b7b9-aaf0d2498e67';

export const ELECTRICAL_WORK_GROUP_IDS = Object.freeze({
  incomingSupply: 'cdd14a6b-d934-4be0-ac32-1654246776d9',
  mainDistributionBoards: 'b624b36a-26a6-4646-8319-58619e39e84b',
  secondaryDistributionBoards: 'e1000000-0000-4000-8000-000000000003',
  ups: '02a5d382-8471-4765-a663-1976d4ef416e',
  powerDistributionCabling: 'b64ae329-9616-4e83-adb1-6cd1a6d08d2e',
  lightingDistributionCabling: 'e1000000-0000-4000-8000-000000000006',
  surfaceContainment: '2854d48a-477e-4407-b71c-5cea81aeb332',
  concealedContainment: 'e1000000-0000-4000-8000-000000000008',
  earthingBonding: '53cb0b86-477b-4c98-9af2-13cb5e3afb26',
  generalLighting: '29bd2eb6-e70f-4724-9cd3-de6716d9cc05',
  featureLighting: 'e1000000-0000-4000-8000-00000000000b',
  emergencyLighting: '8d9bc17d-28b1-4ec3-aa19-55e73cc4a648',
  switchesControls: 'e4946f33-9c11-41cf-b83e-5920112ac039',
  socketsOutlets: '52049988-239a-4b00-a3ea-482acf44a8bb',
  testingCommissioning: 'df3c2db3-f15f-4b7d-aeeb-cb4cd3fe011d',

  // Compatibility aliases for explicit execution-library mappings.
  distributionBoards: 'b624b36a-26a6-4646-8319-58619e39e84b',
  containment: '2854d48a-477e-4407-b71c-5cea81aeb332',
  cables: 'b64ae329-9616-4e83-adb1-6cd1a6d08d2e',
  smallPower: '52049988-239a-4b00-a3ea-482acf44a8bb',
  lighting: '29bd2eb6-e70f-4724-9cd3-de6716d9cc05',
  lightingControls: 'e4946f33-9c11-41cf-b83e-5920112ac039',
  metering: 'cdd14a6b-d934-4be0-ac32-1654246776d9',
  backupPower: '02a5d382-8471-4765-a663-1976d4ef416e',
  busbar: 'b64ae329-9616-4e83-adb1-6cd1a6d08d2e',
  powerQuality: 'df3c2db3-f15f-4b7d-aeeb-cb4cd3fe011d',
});

export const ELECTRICAL_BOQ_DEFINITION_IDS = Object.freeze({
  cable3x2_5: '53ceec5d-9d87-4b03-81fb-f3e50f2c25aa',
  cable5x6: '4e4a99d3-a606-4f0c-88b5-426a462b1df5',
  cable5x16: 'ed6ffb3d-2ba6-424d-9c26-72d3a2e96c13',
});

function workGroup(id, code, label) {
  return { id, disciplineId: ELECTRICAL_DISCIPLINE_ID, code, label };
}

const E = ELECTRICAL_WORK_GROUP_IDS;

export const RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1 = Object.freeze({
  schemaVersion: WORK_ONTOLOGY_SCHEMA_VERSION,
  id: RETAIL_FITOUT_ONTOLOGY_V1_ID,
  version: 1,
  status: 'draft',
  companyId: null,
  label: 'Retail Fit-Out Work Ontology v1 — approved three-level classification',
  departments: [
    { id: CONSTRUCTION_DEPARTMENT_ID, code: 'D100', label: 'Construction', displayOrder: 10 },
  ],
  disciplines: [
    { id: ELECTRICAL_DISCIPLINE_ID, departmentId: CONSTRUCTION_DEPARTMENT_ID, code: 'E100', label: 'Electrical', displayOrder: 20, scopeSelectable: true, budgetSelectable: true },
  ],
  workGroups: [
    workGroup(E.incomingSupply, 'E100.01', 'Incoming Electrical Supply & Network Connection'),
    workGroup(E.mainDistributionBoards, 'E100.02', 'Main Distribution Boards'),
    workGroup(E.secondaryDistributionBoards, 'E100.03', 'Secondary Distribution Boards'),
    workGroup(E.ups, 'E100.04', 'Uninterruptible Power Supply (UPS)'),
    workGroup(E.powerDistributionCabling, 'E100.05', 'Power Distribution Cabling'),
    workGroup(E.lightingDistributionCabling, 'E100.06', 'Lighting Distribution Cabling'),
    workGroup(E.surfaceContainment, 'E100.07', 'Cable Trays, Trunking & Surface Containment'),
    workGroup(E.concealedContainment, 'E100.08', 'Conduits & Concealed Containment'),
    workGroup(E.earthingBonding, 'E100.09', 'Earthing & Bonding'),
    workGroup(E.generalLighting, 'E100.10', 'General Lighting'),
    workGroup(E.featureLighting, 'E100.11', 'Feature, Display & Track Lighting'),
    workGroup(E.emergencyLighting, 'E100.12', 'Emergency & Exit Lighting'),
    workGroup(E.switchesControls, 'E100.13', 'Switches & Lighting Controls'),
    workGroup(E.socketsOutlets, 'E100.14', 'Sockets & Power Outlets'),
    workGroup(E.testingCommissioning, 'E100.15', 'Electrical Testing & Commissioning'),
  ],
  boqItemDefinitions: [
    { id: ELECTRICAL_BOQ_DEFINITION_IDS.cable3x2_5, workGroupId: E.powerDistributionCabling, code: 'E100.05.001', label: 'Cable 3x2.5', defaultUnit: 'm' },
    { id: ELECTRICAL_BOQ_DEFINITION_IDS.cable5x6, workGroupId: E.powerDistributionCabling, code: 'E100.05.002', label: 'Cable 5x6', defaultUnit: 'm' },
    { id: ELECTRICAL_BOQ_DEFINITION_IDS.cable5x16, workGroupId: E.powerDistributionCabling, code: 'E100.05.003', label: 'Cable 5x16', defaultUnit: 'm' },
  ],
});

export const RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1 = Object.freeze([
  ['project_wide.electrical.incoming_supply_interface', E.incomingSupply],
  ['project_wide.electrical.distribution_panels', E.mainDistributionBoards],
  ['project_wide.electrical.containment', E.surfaceContainment],
  ['project_wide.electrical.power_cabling', E.powerDistributionCabling],
  ['project_wide.electrical.small_power', E.socketsOutlets],
  ['project_wide.electrical.lighting_wiring', E.lightingDistributionCabling],
  ['project_wide.electrical.general_lighting', E.generalLighting],
  ['project_wide.electrical.feature_lighting', E.featureLighting],
  ['project_wide.electrical.emergency_lighting', E.emergencyLighting],
  ['project_wide.commissioning.emergency_lighting', E.emergencyLighting],
  ['project_wide.electrical.lighting_controls', E.switchesControls],
  ['project_wide.electrical.earthing_bonding', E.earthingBonding],
  ['project_wide.electrical.metering', E.incomingSupply],
  ['project_wide.electrical.ups', E.ups],
  ['project_wide.electrical.generator_ats', E.ups],
  ['project_wide.electrical.busbar', E.powerDistributionCabling],
  ['project_wide.electrical.power_quality', E.testingCommissioning],
  ['common.commissioning.electrical_final', E.testingCommissioning],
].map(([executionWorkPackageId, workGroupId]) => ({ executionWorkPackageId, workGroupId })));
