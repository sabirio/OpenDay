import {
  CONSTRUCTION_DEPARTMENT_ID,
  ELECTRICAL_DISCIPLINE_ID,
  ELECTRICAL_WORK_GROUP_IDS,
  RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1,
} from './retailFitoutElectricalOntologyV1.js';

export const RETAIL_FITOUT_DEPARTMENT_IDS = Object.freeze({
  construction: CONSTRUCTION_DEPARTMENT_ID,
  security: 'd2000000-0000-4000-8000-000000000002',
  itLowCurrent: 'd3000000-0000-4000-8000-000000000003',
  furnitureJoinery: 'd4000000-0000-4000-8000-000000000004',
  signageGraphics: 'd5000000-0000-4000-8000-000000000005',
  projectAdministration: 'd6000000-0000-4000-8000-000000000006',
});

export const RETAIL_FITOUT_DEPARTMENTS_V1 = Object.freeze([
  { id: RETAIL_FITOUT_DEPARTMENT_IDS.construction, code: 'D100', label: 'Construction', displayOrder: 10 },
  { id: RETAIL_FITOUT_DEPARTMENT_IDS.security, code: 'D200', label: 'Security', displayOrder: 20 },
  { id: RETAIL_FITOUT_DEPARTMENT_IDS.itLowCurrent, code: 'D300', label: 'IT & Low Current', displayOrder: 30 },
  { id: RETAIL_FITOUT_DEPARTMENT_IDS.furnitureJoinery, code: 'D400', label: 'Furniture & Joinery', displayOrder: 40 },
  { id: RETAIL_FITOUT_DEPARTMENT_IDS.signageGraphics, code: 'D500', label: 'Signage & Graphics', displayOrder: 50 },
  { id: RETAIL_FITOUT_DEPARTMENT_IDS.projectAdministration, code: 'D600', label: 'Project Administration & Control', displayOrder: 60 },
]);

export const RETAIL_FITOUT_DISCIPLINE_IDS = Object.freeze({
  construction: '8086e28b-17ab-45be-b464-9514c6b90747',
  electrical: ELECTRICAL_DISCIPLINE_ID,
  hvac: '51fb93ad-e40a-4ad5-b71e-9e5a7539a845',
  plumbingDrainage: 'a0271bb8-74e5-4d46-b479-62721322a865',
  fireLifeSafety: '335e4344-182d-4a14-9354-27fa49083b7f',
  verticalTransportation: '31000000-0000-4000-8000-000000000001',
  security: '20db5108-1f66-4ca3-8f55-4d26f33752c1',
  itLowCurrent: '5b6838fc-9830-45b7-8b15-9d96c1524170',
  audiovisual: 'a1000000-0000-4000-8000-000000000001',
  furnitureJoinery: 'fe3f81ab-dffc-4018-9866-81d5d86afa0b',
  signageGraphics: 'dbe3f3c4-2694-4554-9e8b-c27011e97101',
  projectAdministration: '91000000-0000-4000-8000-000000000001',
});

function discipline(id, departmentId, code, label, displayOrder, scopeSelectable = true) {
  return { id, departmentId, code, label, displayOrder, scopeSelectable, budgetSelectable: true };
}

const DD = RETAIL_FITOUT_DEPARTMENT_IDS;
const D = RETAIL_FITOUT_DISCIPLINE_IDS;

export const RETAIL_FITOUT_DISCIPLINES_V1 = Object.freeze([
  discipline(D.construction, DD.construction, 'C100', 'General Construction', 10),
  discipline(D.electrical, DD.construction, 'E100', 'Electrical', 20),
  discipline(D.hvac, DD.construction, 'H100', 'HVAC', 30),
  discipline(D.plumbingDrainage, DD.construction, 'P100', 'Plumbing & Drainage', 40),
  discipline(D.fireLifeSafety, DD.construction, 'F100', 'Fire & Life Safety', 50),
  discipline(D.verticalTransportation, DD.construction, 'V100', 'Vertical Transportation', 60),
  discipline(D.security, DD.security, 'S100', 'Security', 70),
  discipline(D.itLowCurrent, DD.itLowCurrent, 'I100', 'IT, Voice & Data', 80),
  discipline(D.audiovisual, DD.itLowCurrent, 'A100', 'Audiovisual', 90),
  discipline(D.furnitureJoinery, DD.furnitureJoinery, 'J100', 'Furniture & Joinery', 100),
  discipline(D.signageGraphics, DD.signageGraphics, 'G100', 'Signage & Graphics', 110),
  discipline(D.projectAdministration, DD.projectAdministration, 'M100', 'Project Administration & Control', 120, false),
]);

function groupIds(prefix, entries) {
  return Object.fromEntries(entries.map(([key, suffix, existingId]) => [
    key,
    existingId || `${prefix}0000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
  ]));
}

export const RETAIL_FITOUT_WORK_GROUP_IDS = Object.freeze({
  construction: groupIds('c100', [
    ['preparationSiteSetup', 1, 'c1000000-0000-4000-8000-000000000001'], ['temporaryHoarding', 12], ['temporaryUtilities', 13],
    ['accessTemporaryEquipment', 14], ['materialLogistics', 15], ['demolition', 2, 'c1000000-0000-4000-8000-000000000002'],
    ['cleaningWaste', 10, 'c1000000-0000-4000-8000-00000000000a'], ['structuralSteel', 3, 'c1000000-0000-4000-8000-000000000003'],
    ['stairsOpenings', 16], ['waterproofing', 4, 'c1000000-0000-4000-8000-000000000004'], ['insulation', 17],
    ['gypsumPartitions', 5, 'c1000000-0000-4000-8000-000000000005'], ['masonryPartitions', 18], ['wallSupports', 19],
    ['screedsSubfloors', 20], ['floorFinishes', 8, 'c1000000-0000-4000-8000-000000000008'],
    ['ceilingSystems', 6, 'c1000000-0000-4000-8000-000000000006'], ['wallCladding', 7, 'c1000000-0000-4000-8000-000000000007'],
    ['painting', 21], ['protectiveCoatings', 22], ['glassworks', 9, 'c1000000-0000-4000-8000-000000000009'], ['mirrors', 23],
  ]),
  electrical: ELECTRICAL_WORK_GROUP_IDS,
  hvac: groupIds('1100', [
    ['airHandlingUnits', 2, 'c2000000-0000-4000-8000-000000000002'], ['fanCoilUnits', 11], ['splitSystems', 12],
    ['pumpsHydronic', 3, 'c2000000-0000-4000-8000-000000000003'], ['supportsMounts', 1, 'c2000000-0000-4000-8000-000000000001'],
    ['refrigerantHydraulicPipework', 4, 'c2000000-0000-4000-8000-000000000004'], ['condensateDrainage', 5, 'c2000000-0000-4000-8000-000000000005'],
    ['valvesAccessories', 13], ['sheetMetalDuctwork', 6, 'c2000000-0000-4000-8000-000000000006'], ['flexibleDuctwork', 14],
    ['ventilationFans', 8, 'c2000000-0000-4000-8000-000000000008'], ['smokeExtract', 15], ['dampers', 16],
    ['diffusersGrilles', 7, 'c2000000-0000-4000-8000-000000000007'], ['airCurtains', 17],
    ['controlsPanels', 9, 'c2000000-0000-4000-8000-000000000009'], ['testingCommissioning', 10, 'c2000000-0000-4000-8000-00000000000a'],
  ]),
  plumbingDrainage: groupIds('2100', [
    ['incomingWater', 1, 'c3000000-0000-4000-8000-000000000001'], ['coldWater', 9], ['hotWater', 10],
    ['drainage', 2, 'c3000000-0000-4000-8000-000000000002'], ['valvesAccessories', 11], ['waterHeaters', 12],
    ['sanitaryFixtures', 3, 'c3000000-0000-4000-8000-000000000003'], ['sinksBasins', 5, 'c3000000-0000-4000-8000-000000000005'],
    ['testingCommissioning', 8, 'c3000000-0000-4000-8000-000000000008'],
  ]),
  fireLifeSafety: groupIds('f100', [
    ['mainPipework', 1, 'c4000000-0000-4000-8000-000000000001'], ['sprinklerPipework', 10], ['sprinklerHeads', 11],
    ['hoseReels', 5, 'c4000000-0000-4000-8000-000000000005'], ['extinguishers', 6, 'c4000000-0000-4000-8000-000000000006'],
    ['alarmPanels', 2, 'c4000000-0000-4000-8000-000000000002'], ['manualCallPoints', 12], ['detectors', 13],
    ['sounders', 14], ['alarmCabling', 15], ['firePumps', 8, 'c4000000-0000-4000-8000-000000000008'],
    ['testingCommissioning', 9, 'c4000000-0000-4000-8000-000000000009'],
  ]),
  verticalTransportation: groupIds('3100', [['elevators', 1], ['escalators', 2], ['controlPanels', 3], ['safetyDevices', 4], ['powerInterfaces', 5], ['testingCommissioning', 6]]),
  security: groupIds('5100', [
    ['cctv', 1, 'c5000000-0000-4000-8000-000000000001'], ['cctvRecording', 7],
    ['accessControl', 2, 'c5000000-0000-4000-8000-000000000002'], ['intrusionAlarm', 3, 'c5000000-0000-4000-8000-000000000003'],
    ['intercom', 4, 'c5000000-0000-4000-8000-000000000004'], ['eas', 8], ['detectorsSensors', 9], ['controlPanels', 10],
    ['physicalSecurity', 5, 'c5000000-0000-4000-8000-000000000005'], ['cablingContainment', 11],
    ['testingCommissioning', 6, 'c5000000-0000-4000-8000-000000000006'],
  ]),
  itLowCurrent: groupIds('6100', [
    ['structuredCabling', 1, 'c6000000-0000-4000-8000-000000000001'], ['dataOutlets', 2, 'c6000000-0000-4000-8000-000000000002'],
    ['networkRacks', 3, 'c6000000-0000-4000-8000-000000000003'], ['networkEquipment', 10, 'c6000000-0000-4000-8000-00000000000a'],
    ['wifi', 4, 'c6000000-0000-4000-8000-000000000004'], ['telephony', 13], ['containment', 14], ['powerInterfaces', 15],
    ['testingCommissioning', 12, 'c6000000-0000-4000-8000-00000000000c'],
  ]),
  audiovisual: groupIds('a100', [['speakers', 1], ['audioElectronics', 2], ['microphones', 3], ['ledScreens', 4], ['mediaControllers', 5], ['displaySupports', 6], ['cablingContainment', 7], ['testingCommissioning', 8]]),
  furnitureJoinery: groupIds('7100', [
    ['metalDoors', 4, 'c7000000-0000-4000-8000-000000000004'], ['timberDoors', 8], ['fireRatedJoinery', 9], ['slidingShutters', 10],
    ['handrailsMetalwork', 11], ['displayJoinery', 1, 'c7000000-0000-4000-8000-000000000001'],
    ['backOfHouseFurniture', 7, 'c7000000-0000-4000-8000-000000000007'], ['officeKitchenLockers', 6, 'c7000000-0000-4000-8000-000000000006'],
    ['storageRacking', 5, 'c7000000-0000-4000-8000-000000000005'], ['perimeterFurniture', 12], ['freestandingFurniture', 13],
    ['cashDesks', 3, 'c7000000-0000-4000-8000-000000000003'], ['fittingRooms', 2, 'c7000000-0000-4000-8000-000000000002'], ['showWindowFurniture', 14],
  ]),
  signageGraphics: groupIds('8100', [
    ['internalSignage', 2, 'c8000000-0000-4000-8000-000000000002'], ['staffSignage', 7],
    ['wayfinding', 3, 'c8000000-0000-4000-8000-000000000003'], ['internalBranding', 8],
    ['externalBranding', 1, 'c8000000-0000-4000-8000-000000000001'], ['illuminatedSigns', 9], ['nonIlluminatedSigns', 10],
    ['graphicsVinyl', 5, 'c8000000-0000-4000-8000-000000000005'],
  ]),
  projectAdministration: groupIds('9100', [['permits', 1], ['statutoryPermits', 2], ['insuranceBonds', 3], ['guarantees', 4], ['mobilisationTravel', 5], ['siteManagement', 6], ['hse', 7], ['qualityControl', 8], ['handoverDocumentation', 9], ['projectCloseout', 10]]),
});

const G = RETAIL_FITOUT_WORK_GROUP_IDS;

// Compatibility aliases keep the explicit 221-item execution classification valid.
Object.assign(G.construction, { buildersWorks: G.construction.structuralSteel, substratesWaterproofing: G.construction.waterproofing, partitionsDoors: G.construction.gypsumPartitions, ceilings: G.construction.ceilingSystems, wallFinishes: G.construction.wallCladding, flooring: G.construction.floorFinishes, shopfrontFacade: G.construction.glassworks, finalCleaning: G.construction.cleaningWaste, snagging: G.construction.cleaningWaste });
Object.assign(G.hvac, { interfaces: G.hvac.supportsMounts, airConditioningEquipment: G.hvac.airHandlingUnits, chilledWater: G.hvac.pumpsHydronic, refrigerantPiping: G.hvac.refrigerantHydraulicPipework, ductwork: G.hvac.sheetMetalDuctwork, airDistribution: G.hvac.diffusersGrilles, ventilationExhaust: G.hvac.ventilationFans, controlsBms: G.hvac.controlsPanels });
Object.assign(G.plumbingDrainage, { waterSupply: G.plumbingDrainage.incomingWater, pumps: G.plumbingDrainage.incomingWater, pantryPlumbing: G.plumbingDrainage.sinksBasins, greaseTraps: G.plumbingDrainage.drainage, waterTreatment: G.plumbingDrainage.incomingWater });
Object.assign(G.fireLifeSafety, { sprinklers: G.fireLifeSafety.mainPipework, fireAlarm: G.fireLifeSafety.alarmPanels, smokeControl: G.fireLifeSafety.testingCommissioning, fireDampers: G.fireLifeSafety.testingCommissioning, fireHoseCabinets: G.fireLifeSafety.hoseReels, fireStopping: G.fireLifeSafety.testingCommissioning, suppression: G.fireLifeSafety.firePumps });
Object.assign(G.furnitureJoinery, { salesFixtures: G.furnitureJoinery.displayJoinery, serviceCounters: G.furnitureJoinery.cashDesks, specialistJoinery: G.furnitureJoinery.metalDoors, cabinetsLockers: G.furnitureJoinery.officeKitchenLockers, officeStaffFurniture: G.furnitureJoinery.backOfHouseFurniture });
Object.assign(G.signageGraphics, { externalBrandSignage: G.signageGraphics.externalBranding, internalBrandSignage: G.signageGraphics.internalSignage, regulatorySafety: G.signageGraphics.staffSignage, graphics: G.signageGraphics.graphicsVinyl, menuPriceCategory: G.signageGraphics.internalSignage });

function workGroup(id, disciplineId, code, label) { return { id, disciplineId, code, label }; }
function rows(disciplineId, prefix, definitions) { return definitions.map(([key, label], index) => workGroup(G[prefix][key], disciplineId, `${RETAIL_FITOUT_DISCIPLINES_V1.find(item => item.id === disciplineId).code}.${String(index + 1).padStart(2, '0')}`, label)); }

const GROUP_DEFINITIONS = Object.freeze({
  construction: [['preparationSiteSetup','Preliminaries & Site Setup'],['temporaryHoarding','Temporary Hoarding & Site Protection'],['temporaryUtilities','Temporary Utilities & Facilities'],['accessTemporaryEquipment','Access, Scaffolding & Temporary Equipment'],['materialLogistics','Material Handling & Internal Logistics'],['demolition','Demolition & Dismantling'],['cleaningWaste','Construction Cleaning & Waste Removal'],['structuralSteel','Structural Steel & Supporting Frames'],['stairsOpenings','Stairs, Platforms & Structural Openings'],['waterproofing','Waterproofing'],['insulation','Thermal & Acoustic Insulation'],['gypsumPartitions','Gypsumboard Partitions'],['masonryPartitions','Masonry & Blockwork Partitions'],['wallSupports','Wall Reinforcement & Auxiliary Supports'],['screedsSubfloors','Screeds, Levelling & Subfloor Preparation'],['floorFinishes','Floor Finishes & Skirting'],['ceilingSystems','Ceiling Systems & Access Panels'],['wallCladding','Wall Cladding & Coverings'],['painting','Painting & Decorative Finishes'],['protectiveCoatings','Protective & Fire-Retardant Coatings'],['glassworks','Glassworks'],['mirrors','Mirrors']],
  hvac: [['airHandlingUnits','Air Handling Units'],['fanCoilUnits','Fan Coil Units'],['splitSystems','Split & Multi-Split Systems'],['pumpsHydronic','Pumps & Hydronic Equipment'],['supportsMounts','Equipment Supports & Anti-Vibration Mounts'],['refrigerantHydraulicPipework','Refrigerant & Hydraulic Pipework'],['condensateDrainage','Condensate Drainage'],['valvesAccessories','HVAC Valves & Accessories'],['sheetMetalDuctwork','Sheet-Metal Ductwork'],['flexibleDuctwork','Flexible Ductwork'],['ventilationFans','Ventilation & Extract Fans'],['smokeExtract','Smoke Extract Systems'],['dampers','Volume-Control & Fire/Smoke Dampers'],['diffusersGrilles','Diffusers, Grilles & Louvres'],['airCurtains','Air Curtains'],['controlsPanels','HVAC Controls & Electrical Panels'],['testingCommissioning','HVAC Testing, Balancing & Commissioning']],
  plumbingDrainage: [['incomingWater','Incoming Water Supply & Metering'],['coldWater','Cold-Water Distribution'],['hotWater','Hot-Water Distribution'],['drainage','Soil, Waste & Drainage Pipework'],['valvesAccessories','Valves, Fittings & Accessories'],['waterHeaters','Water Heaters'],['sanitaryFixtures','Toilets & Sanitary Fixtures'],['sinksBasins','Sinks, Basins & Taps'],['testingCommissioning','Plumbing Testing & Commissioning']],
  fireLifeSafety: [['mainPipework','Fire-Water Connection & Main Pipework'],['sprinklerPipework','Sprinkler Pipework'],['sprinklerHeads','Sprinkler Heads'],['hoseReels','Fire Hose Reels'],['extinguishers','Portable Fire Extinguishers'],['alarmPanels','Fire Alarm Control Panels & Modules'],['manualCallPoints','Manual Call Points'],['detectors','Smoke & Fire Detectors'],['sounders','Sounders, Sirens & Visual Alarms'],['alarmCabling','Fire Alarm Cabling & Containment'],['firePumps','Fire Pumps & Water Storage'],['testingCommissioning','Fire-System Testing & Commissioning']],
  verticalTransportation: [['elevators','Elevators'],['escalators','Escalators'],['controlPanels','Lift & Escalator Control Panels'],['safetyDevices','Sensors, Detectors & Safety Devices'],['powerInterfaces','Power, Cabling & Interfaces'],['testingCommissioning','Programming, Testing & Commissioning']],
  security: [['cctv','CCTV / Cameras'],['cctvRecording','CCTV Recording, Switching & Monitoring'],['accessControl','Access Control'],['intrusionAlarm','Intrusion Alarm'],['intercom','Intercom'],['eas','Electronic Article Surveillance (EAS)'],['detectorsSensors','Security Detectors & Sensors'],['controlPanels','Security Control Panels & Keypads'],['physicalSecurity','Physical Security, Locks & Exit Devices'],['cablingContainment','Security Cabling & Containment'],['testingCommissioning','Security Testing & Commissioning']],
  itLowCurrent: [['structuredCabling','Structured Cabling'],['dataOutlets','Data Outlets & Patch Points'],['networkRacks','Network Racks & Cabinets'],['networkEquipment','Network Equipment & Accessories'],['wifi','Wi-Fi Infrastructure'],['telephony','Telephony'],['containment','Low-Current Conduits & Containment'],['powerInterfaces','IT Power & UPS Interfaces'],['testingCommissioning','Network Testing & Commissioning']],
  audiovisual: [['speakers','Background-Music & Public-Address Speakers'],['audioElectronics','Amplifiers, Mixers & Audio Sources'],['microphones','Microphones & Audio Accessories'],['ledScreens','LED Screens & Display Panels'],['mediaControllers','TVs, Media Players & Display Controllers'],['displaySupports','Display Supports & Totem Structures'],['cablingContainment','Audiovisual Cabling & Containment'],['testingCommissioning','Audiovisual Testing & Commissioning']],
  furnitureJoinery: [['metalDoors','Metal Doors & Frames'],['timberDoors','Timber Doors & Frames'],['fireRatedJoinery','Fire-Rated Doors & Joinery'],['slidingShutters','Sliding Doors, Shutters & Entrance Systems'],['handrailsMetalwork','Handrails, Balustrades & Metalwork'],['displayJoinery','Display-Window Joinery & Platforms'],['backOfHouseFurniture','Back-of-House & Staff Furniture'],['officeKitchenLockers','Office, Kitchen & Locker Furniture'],['storageRacking','Storage Racking & Shelving'],['perimeterFurniture','Sales-Floor Perimeter Furniture'],['freestandingFurniture','Sales-Floor Freestanding Furniture'],['cashDesks','Cash Desks'],['fittingRooms','Fitting-Room Furniture'],['showWindowFurniture','Show-Window Furniture']],
  signageGraphics: [['internalSignage','Internal Signage'],['staffSignage','Staff & Back-of-House Signage'],['wayfinding','Wayfinding & Statutory Signage'],['internalBranding','Internal Façade Branding'],['externalBranding','External Façade Branding'],['illuminatedSigns','Illuminated Brand Signs'],['nonIlluminatedSigns','Non-Illuminated Brand Signs'],['graphicsVinyl','Applied Graphics & Vinyl']],
  projectAdministration: [['permits','Construction Permits & Approvals'],['statutoryPermits','Other Statutory Permits'],['insuranceBonds','Insurance & Bonds'],['guarantees','Guarantees & Warranties'],['mobilisationTravel','Project Mobilisation & Travel'],['siteManagement','Site Supervision & Management'],['hse','Health, Safety & Environmental Management'],['qualityControl','Quality Control & Inspections'],['handoverDocumentation','As-Built Documentation & Handover'],['projectCloseout','Overall Testing & Project Closeout']],
});

export const RETAIL_FITOUT_NON_ELECTRICAL_WORK_GROUPS_V1 = Object.freeze([
  ...rows(D.construction, 'construction', GROUP_DEFINITIONS.construction), ...rows(D.hvac, 'hvac', GROUP_DEFINITIONS.hvac),
  ...rows(D.plumbingDrainage, 'plumbingDrainage', GROUP_DEFINITIONS.plumbingDrainage), ...rows(D.fireLifeSafety, 'fireLifeSafety', GROUP_DEFINITIONS.fireLifeSafety),
  ...rows(D.verticalTransportation, 'verticalTransportation', GROUP_DEFINITIONS.verticalTransportation), ...rows(D.security, 'security', GROUP_DEFINITIONS.security),
  ...rows(D.itLowCurrent, 'itLowCurrent', GROUP_DEFINITIONS.itLowCurrent), ...rows(D.audiovisual, 'audiovisual', GROUP_DEFINITIONS.audiovisual),
  ...rows(D.furnitureJoinery, 'furnitureJoinery', GROUP_DEFINITIONS.furnitureJoinery), ...rows(D.signageGraphics, 'signageGraphics', GROUP_DEFINITIONS.signageGraphics),
  ...rows(D.projectAdministration, 'projectAdministration', GROUP_DEFINITIONS.projectAdministration),
]);

export const RETAIL_FITOUT_WORK_ONTOLOGY_V1 = Object.freeze({
  ...RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1,
  label: 'Retail Fit-Out Work Ontology v1 — approved three-level classification',
  departments: RETAIL_FITOUT_DEPARTMENTS_V1,
  disciplines: RETAIL_FITOUT_DISCIPLINES_V1,
  workGroups: Object.freeze([
    ...RETAIL_FITOUT_NON_ELECTRICAL_WORK_GROUPS_V1.filter(item => item.disciplineId === D.construction),
    ...RETAIL_FITOUT_ELECTRICAL_ONTOLOGY_V1.workGroups,
    ...RETAIL_FITOUT_NON_ELECTRICAL_WORK_GROUPS_V1.filter(item => item.disciplineId !== D.construction),
  ]),
});
