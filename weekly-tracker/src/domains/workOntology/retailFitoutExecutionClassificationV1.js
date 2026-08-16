import { RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1 } from './retailFitoutElectricalOntologyV1.js';
import { RETAIL_FITOUT_WORK_GROUP_IDS as G } from './retailFitoutOntologyV1.js';

export const EXECUTION_CLASSIFICATION_REASON_CODES = Object.freeze({
  deferredDiscipline: 'DEFERRED_DISCIPLINE',
  lifecycleApproval: 'LIFECYCLE_APPROVAL',
  lifecycleDocumentation: 'LIFECYCLE_DOCUMENTATION',
  lifecycleInspection: 'LIFECYCLE_INSPECTION',
  lifecycleTraining: 'LIFECYCLE_TRAINING',
  crossDisciplineCommissioning: 'CROSS_DISCIPLINE_COMMISSIONING',
});

function mapped(workGroupId, ids) {
  return ids.map(executionWorkPackageId => ({ executionWorkPackageId, kind: 'mapped', workGroupId }));
}

function excluded(kind, reasonCode, ids) {
  return ids.map(executionWorkPackageId => ({ executionWorkPackageId, kind, reasonCode }));
}

const electrical = RETAIL_FITOUT_ELECTRICAL_EXECUTION_MAPPINGS_V1.map(mapping => ({
  ...mapping,
  kind: 'mapped',
}));

export const RETAIL_FITOUT_EXECUTION_CLASSIFICATIONS_V1 = Object.freeze([
  ...electrical,

  ...mapped(G.construction.preparationSiteSetup, [
    'project_wide.preparation.project_setting_out',
    'project_wide.preparation.existing_area_protection',
  ]),
  ...mapped(G.construction.demolition, [
    'common.demolition.strip_out',
    'common.demolition.structural',
    'common.demolition.mep_disconnect',
  ]),
  ...mapped(G.construction.buildersWorks, [
    'project_wide.builders_works.openings_penetrations',
    'project_wide.builders_works.core_drilling',
    'project_wide.builders_works.structural_supports',
    'project_wide.builders_works.slab_repairs',
    'project_wide.builders_works.mep_builders_works',
    'project_wide.builders_works.equipment_supports',
  ]),
  ...mapped(G.construction.substratesWaterproofing, [
    'project_wide.substrates.floor_preparation',
    'common.floor_prep.screed',
    'project_wide.substrates.waterproofing',
    'project_wide.substrates.raised_access_floor',
  ]),
  ...mapped(G.construction.partitionsDoors, [
    'sales.partitions.metal_framing',
    'sales.partitions.plasterboard',
    'sales.partitions.special',
    'sales.partitions.acoustic',
    'sales.partitions.glass',
    'sales.partitions.doors',
    'sales.partitions.fire_doors',
    'sales.partitions.access_panels',
    'boh.partitions.metal_framing',
    'boh.partitions.plasterboard',
    'boh.partitions.special',
    'boh.partitions.acoustic',
    'boh.partitions.doors',
    'boh.partitions.fire_doors',
    'boh.partitions.access_panels',
  ]),
  ...mapped(G.construction.ceilings, [
    'sales.ceilings.framing',
    'sales.ceilings.gypsum',
    'sales.ceilings.suspended_grid',
    'sales.ceilings.open_ceiling',
    'sales.ceilings.acoustic',
    'sales.ceilings.feature',
    'sales.finishing.ceiling_final',
    'boh.ceilings.framing',
    'boh.ceilings.gypsum',
    'boh.ceilings.suspended_grid',
    'boh.ceilings.open_ceiling',
    'boh.ceilings.acoustic',
    'boh.finishing.ceiling_final',
  ]),
  ...mapped(G.construction.wallFinishes, [
    'sales.wall_finishes.surface_preparation',
    'sales.wall_finishes.painting',
    'sales.wall_finishes.coverings',
    'sales.wall_finishes.decorative',
    'sales.wall_finishes.panels',
    'sales.wall_finishes.cladding',
    'sales.wall_finishes.ceramic_tiles',
    'sales.wall_finishes.mirrors',
    'sales.wall_finishes.special_coatings',
    'boh.wall_finishes.surface_preparation',
    'boh.wall_finishes.painting',
    'boh.wall_finishes.coverings',
    'boh.wall_finishes.decorative',
    'boh.wall_finishes.panels',
    'boh.wall_finishes.ceramic_tiles',
    'boh.wall_finishes.special_coatings',
  ]),
  ...mapped(G.construction.flooring, [
    'sales.flooring.tile',
    'sales.flooring.vinyl_lvt',
    'sales.flooring.carpet',
    'sales.flooring.timber_laminate',
    'sales.flooring.resin_epoxy',
    'sales.flooring.polished_concrete',
    'sales.flooring.skirting_trims',
    'boh.flooring.tile',
    'boh.flooring.vinyl_lvt',
    'boh.flooring.carpet',
    'boh.flooring.timber_laminate',
    'boh.flooring.resin_epoxy',
    'boh.flooring.polished_concrete',
    'boh.flooring.skirting_trims',
  ]),
  ...mapped(G.construction.shopfrontFacade, [
    'sales.facade.shopfront_framing',
    'sales.facade.shopfront_glazing',
    'sales.facade.entrance_doors',
    'sales.facade.automatic_doors',
    'sales.facade.cladding_finishes',
    'sales.facade.canopies',
    'sales.facade.window_display_infrastructure',
  ]),
  ...mapped(G.construction.finalCleaning, ['project_wide.pre_handover.final_cleaning']),
  ...mapped(G.construction.snagging, ['project_wide.pre_handover.snagging']),

  ...mapped(G.hvac.interfaces, ['project_wide.hvac.landlord_interface']),
  ...mapped(G.hvac.airConditioningEquipment, [
    'project_wide.hvac.fcu_installation',
    'project_wide.hvac.ahu_installation',
    'project_wide.hvac.vrf_vrv',
    'project_wide.hvac.split_systems',
    'project_wide.hvac.air_curtains',
    'project_wide.hvac.server_room_cooling',
  ]),
  ...mapped(G.hvac.chilledWater, ['project_wide.hvac.chilled_water_interface']),
  ...mapped(G.hvac.refrigerantPiping, ['project_wide.hvac.refrigerant_piping']),
  ...mapped(G.hvac.condensateDrainage, ['project_wide.hvac.condensate_drainage']),
  ...mapped(G.hvac.ductwork, ['project_wide.hvac.ductwork']),
  ...mapped(G.hvac.airDistribution, ['project_wide.hvac.air_distribution']),
  ...mapped(G.hvac.ventilationExhaust, [
    'project_wide.hvac.ventilation_extract',
    'project_wide.hvac.special_exhaust',
  ]),
  ...mapped(G.hvac.controlsBms, [
    'common.mep_backbone.hvac_controls',
    'project_wide.hvac.bms_integration',
  ]),
  ...mapped(G.hvac.testingCommissioning, [
    'project_wide.commissioning.hvac_tab',
    'common.commissioning.hvac_final',
    'project_wide.commissioning.controls_bms',
  ]),

  ...mapped(G.plumbingDrainage.waterSupply, [
    'project_wide.plumbing.cold_water',
    'project_wide.plumbing.hot_water',
  ]),
  ...mapped(G.plumbingDrainage.drainage, [
    'project_wide.plumbing.drainage',
    'project_wide.plumbing.floor_drains',
  ]),
  ...mapped(G.plumbingDrainage.sanitaryFixtures, ['project_wide.plumbing.sanitary']),
  ...mapped(G.plumbingDrainage.pumps, ['project_wide.plumbing.special_pumps']),
  ...mapped(G.plumbingDrainage.pantryPlumbing, ['project_wide.plumbing.pantry']),
  ...mapped(G.plumbingDrainage.greaseTraps, ['project_wide.plumbing.grease_trap']),
  ...mapped(G.plumbingDrainage.waterTreatment, ['project_wide.plumbing.water_treatment']),
  ...mapped(G.plumbingDrainage.testingCommissioning, ['project_wide.commissioning.plumbing']),

  ...mapped(G.fireLifeSafety.sprinklers, [
    'common.mep_backbone.sprinkler',
    'project_wide.commissioning.sprinkler_acceptance',
  ]),
  ...mapped(G.fireLifeSafety.fireAlarm, [
    'project_wide.fire.fire_alarm',
    'project_wide.fire.panel_interface',
    'project_wide.fire.system_interfaces',
    'common.commissioning.fire_alarm_test',
  ]),
  ...mapped(G.fireLifeSafety.smokeControl, [
    'common.mep_backbone.smoke_extraction',
    'common.commissioning.smoke_extraction_test',
  ]),
  ...mapped(G.fireLifeSafety.fireDampers, ['project_wide.fire.fire_dampers']),
  ...mapped(G.fireLifeSafety.fireHoseCabinets, [
    'common.mep_backbone.fire_hose_cabinet',
    'project_wide.commissioning.fhc_acceptance',
  ]),
  ...mapped(G.fireLifeSafety.extinguishers, ['project_wide.fire.extinguishers']),
  ...mapped(G.fireLifeSafety.fireStopping, ['project_wide.fire.fire_stopping']),
  ...mapped(G.fireLifeSafety.suppression, [
    'project_wide.fire.gas_suppression',
    'project_wide.fire.kitchen_suppression',
  ]),

  ...mapped(G.security.cctv, ['project_wide.low_current.cctv']),
  ...mapped(G.security.accessControl, ['project_wide.low_current.access_control']),
  ...mapped(G.security.intrusionAlarm, ['project_wide.low_current.intrusion_alarm']),
  ...mapped(G.security.intercom, ['project_wide.low_current.intercom']),
  ...mapped(G.security.physicalSecurity, [
    'sales.facade.security_glazing',
    'sales.facade.security_shutters',
    'project_wide.external.anti_ram',
  ]),
  ...mapped(G.security.testingCommissioning, [
    'project_wide.commissioning.access_control',
    'project_wide.commissioning.cctv',
  ]),
  ...mapped(G.security.eas, ['sales.retail_technology.eas_gates']),

  ...mapped(G.verticalTransportation.powerInterfaces, ['project_wide.external.vertical_transport_interface']),

  ...mapped(G.itLowCurrent.structuredCabling, ['project_wide.low_current.structured_cabling']),
  ...mapped(G.itLowCurrent.dataOutlets, ['project_wide.low_current.fiber']),
  ...mapped(G.itLowCurrent.networkRacks, ['project_wide.low_current.network_rack']),
  ...mapped(G.itLowCurrent.wifi, ['project_wide.low_current.wifi']),
  ...mapped(G.audiovisual.speakers, ['project_wide.low_current.pa_music']),
  ...mapped(G.audiovisual.audioElectronics, ['project_wide.low_current.av_systems']),
  ...mapped(G.itLowCurrent.networkEquipment, ['project_wide.low_current.network_equipment']),
  ...mapped(G.itLowCurrent.testingCommissioning, ['project_wide.commissioning.low_current']),

  ...mapped(G.furnitureJoinery.salesFixtures, [
    'sales.furniture.wall_fixtures',
    'sales.furniture.freestanding',
    'sales.furniture.display_shelving',
  ]),
  ...mapped(G.furnitureJoinery.fittingRooms, ['sales.furniture.fitting_rooms']),
  ...mapped(G.furnitureJoinery.serviceCounters, [
    'sales.furniture.cash_desk',
    'sales.furniture.service_desk',
  ]),
  ...mapped(G.furnitureJoinery.specialistJoinery, ['sales.furniture.specialist_joinery']),
  ...mapped(G.furnitureJoinery.storageRacking, ['boh.furniture.stockroom_shelving']),
  ...mapped(G.furnitureJoinery.cabinetsLockers, [
    'boh.furniture.storage_cabinets',
    'boh.furniture.lockers',
  ]),
  ...mapped(G.furnitureJoinery.officeStaffFurniture, [
    'boh.furniture.pantry',
    'boh.furniture.office',
    'boh.furniture.workstations',
    'boh.equipment.staff_facilities',
  ]),

  ...mapped(G.signageGraphics.externalBrandSignage, ['sales.facade.external_brand_signage']),
  ...mapped(G.signageGraphics.internalBrandSignage, ['sales.signage.internal_brand']),
  ...mapped(G.signageGraphics.wayfinding, ['sales.signage.wayfinding']),
  ...mapped(G.signageGraphics.regulatorySafety, ['sales.signage.regulatory_safety']),
  ...mapped(G.signageGraphics.graphics, [
    'sales.signage.window_graphics',
    'sales.signage.wall_graphics',
  ]),
  ...mapped(G.signageGraphics.menuPriceCategory, [
    'sales.signage.menu_boards',
    'sales.signage.price_category',
  ]),

  ...excluded('deferred', EXECUTION_CLASSIFICATION_REASON_CODES.deferredDiscipline, [
    'project_wide.refrigeration.cold_rooms',
    'project_wide.refrigeration.freezer_rooms',
    'project_wide.refrigeration.system',
    'project_wide.refrigeration.display_units',
    'project_wide.food_service.kitchen_equipment',
    'project_wide.external.loading_area',
    'project_wide.external.paving_civil',
    'sales.retail_technology.pos',
    'sales.retail_technology.self_checkout',
    'sales.retail_technology.digital_screens',
    'sales.retail_technology.interactive_displays',
    'sales.retail_technology.esl',
    'sales.retail_technology.queue_management',
    'sales.retail_technology.click_collect',
    'sales.retail_technology.charging',
    'project_wide.low_current.people_counting',
    'project_wide.low_current.digital_signage_infrastructure',
    'project_wide.low_current.time_attendance',
    'boh.equipment.it_equipment',
    'boh.equipment.printers',
    'boh.equipment.office_devices',
    'boh.equipment.pantry',
  ]),

  ...excluded('lifecycle', EXECUTION_CLASSIFICATION_REASON_CODES.crossDisciplineCommissioning, [
    'common.commissioning.integrated_systems_test',
  ]),
  ...excluded('lifecycle', EXECUTION_CLASSIFICATION_REASON_CODES.lifecycleDocumentation, [
    'common.pre_opening.test_reports',
    'project_wide.handover.as_built',
    'project_wide.handover.om_manuals',
    'project_wide.handover.warranties',
    'project_wide.handover.asset_handover',
  ]),
  ...excluded('lifecycle', EXECUTION_CLASSIFICATION_REASON_CODES.lifecycleApproval, [
    'project_wide.pre_handover.authority_approvals',
    'project_wide.pre_handover.landlord_approval',
    'common.handover.acceptance_act',
    'common.handover.keys_possession',
  ]),
  ...excluded('lifecycle', EXECUTION_CLASSIFICATION_REASON_CODES.lifecycleInspection, [
    'common.pre_opening.final_walkthrough',
    'common.handover.snag_closure',
    'common.handover.final_inspection',
  ]),
  ...excluded('lifecycle', EXECUTION_CLASSIFICATION_REASON_CODES.lifecycleTraining, [
    'project_wide.pre_handover.training',
  ]),
]);
