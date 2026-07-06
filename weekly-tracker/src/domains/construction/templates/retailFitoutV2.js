// retailFitoutV2.js — zoned retail fit-out template (single source of truth).
//
// Fully isolated from constructionRetailV1.js/masterTaskLibrary.js: a
// different progress model (zone × category × work-package instead of flat
// phases), a different id vocabulary, no shared code path. v1 projects are
// completely unaffected by this file.
//
// ID scheme (ASSUMPTION — ids are stable machine keys, never shown to users):
//   zone:      'common' | 'sales' | 'boh'
//   category:  '{zone}.{category_slug}', e.g. 'common.mep_backbone'
//   workPkg:   '{zone}.{category_slug}.{wp_slug}', e.g. 'common.mep_backbone.hvac_equipment'
// Categories are zone-scoped even where the label/WP-list is textually
// identical between zones (e.g. Sales/BoH "Flooring Works") — the physical
// work (and its progress tracking) is genuinely distinct per zone, so a
// shared cross-zone category id would be wrong, not a dedup opportunity.
//
// Weighting model (spec, exact):
//   'common' is a fixed 35% (shared MEP backbone, life-safety systems,
//   common-area finishes — present regardless of store size).
//   'sales' and 'boh' split the remaining 65% by floor area (m²):
//     zoneWeight = 0.65 * (zoneArea / (salesArea + bohArea))
//   When no area has been entered yet, sales/boh fall back to their
//   defaultWeight ratio (45:20, already summing to the 65 remaining) — see
//   core/projects/weights/computeZoneWeights.js (reused unchanged from the
//   isolated v2 scaffold; the area-proportional formula it already
//   implements is byte-identical to the one specified here).
//
// Within a zone, each category carries an explicit `weight` (ASSUMPTION —
// hand-assigned reflecting realistic construction effort/risk, the same way
// constructionRetailV1.js hand-assigns phase progressWeight rather than
// deriving it from WP count; MEP/life-safety categories are weighted
// heaviest, matching that file's own precedent of testing/MEP phases
// carrying outsized risk weight). Category weights are normalized to 100
// within their zone via normalizeWeightsTo100 (core/projects/weights/) —
// see computeZoneWeights.computeZonedEffectiveWeights.
//
// Within a category, every work package gets an equal durationPct share
// (ASSUMPTION — no differentiating duration estimate was provided; equal
// split is the same no-data fallback normalizeWeightsTo100 itself uses).
// durationPct values are also reused directly as each WP's share of its
// category's seeded Gantt duration (see ganttEngine.js's v2 branch) — the
// same numbers serve both progress-weighting and schedule-duration, exactly
// mirroring how constructionRetailV1.js's duration_pct/progressWeight double
// as both today.
//
// openingBlocker ('critical'|'soft'|false) + typicalClearDays + responsibleRole
// follow the exact vocabulary openingReadinessEngine.js already reads for v1
// (see BLOCKER_WPS in that file) — ASSUMPTION: safety-critical MEP/commissioning/
// handover items are 'critical'; softer readiness items (training, cleaning,
// BMS integration) are 'soft'; routine construction/finishing work is false.

function equalDurationPct(n) {
  const base = Math.round((1 / n) * 100) / 100;
  const pcts = new Array(n).fill(base);
  const drift = Math.round((1 - pcts.reduce((s, p) => s + p, 0)) * 100) / 100;
  pcts[pcts.length - 1] = Math.round((pcts[pcts.length - 1] + drift) * 100) / 100;
  return pcts;
}

function wps(zonePrefix, categorySlug, items) {
  const pcts = equalDurationPct(items.length);
  return items.map(([slug, label, extra = {}], i) => ({
    id: `${zonePrefix}.${categorySlug}.${slug}`,
    label,
    durationPct: pcts[i],
    isBlocker: extra.isBlocker ?? false,
    openingBlocker: extra.openingBlocker ?? false,
    ...(extra.openingBlocker ? { typicalClearDays: extra.typicalClearDays ?? 3, responsibleRole: extra.responsibleRole ?? 'GC' } : {}),
  }));
}

export const CATEGORY_LIBRARY = {
  // ── Common Works ────────────────────────────────────────────────────────
  'common.demolition': {
    label: 'Demolition',
    workPackages: wps('common', 'demolition', [
      ['strip_out',      'Strip Out & Clear'],
      ['structural',     'Structural Demolition'],
      ['mep_disconnect', 'MEP Disconnection'],
    ]),
  },
  'common.floor_prep': {
    label: 'Floor Preparation',
    workPackages: wps('common', 'floor_prep', [
      ['screed', 'Screed / Self-Levelling', { isBlocker: true }],
    ]),
  },
  'common.construction': {
    label: 'Construction Works',
    workPackages: wps('common', 'construction', [
      ['wall_marking', 'Wall Marking & Setting Out'],
      ['openings',     'Openings / Supports / Reinforcements'],
      ['facade',       'Facade Installation'],
    ]),
  },
  'common.mep_backbone': {
    label: 'MEP Backbone Works',
    workPackages: wps('common', 'mep_backbone', [
      ['electrical_panels', 'Electrical Panels & Distribution',    { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 4, responsibleRole: 'GC' }],
      ['emergency_power',   'Emergency Power / UPS Installation',  { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'GC' }],
      ['hvac_equipment',    'HVAC Equipment Installation',         { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 5, responsibleRole: 'GC' }],
      ['hvac_controls',     'HVAC Controls Installation',          { isBlocker: false }],
      ['sprinkler',         'Sprinkler System Installation',       { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 4, responsibleRole: 'GC' }],
      ['smoke_detection',   'Smoke Detection System Installation', { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'GC' }],
      ['smoke_extraction',  'Smoke Extraction System Installation',{ isBlocker: true, openingBlocker: 'critical', typicalClearDays: 4, responsibleRole: 'GC' }],
      ['fire_hose_cabinet', 'Fire Hose Cabinet System Installation', { isBlocker: false, openingBlocker: 'soft', typicalClearDays: 2, responsibleRole: 'GC' }],
    ]),
  },
  'common.commissioning': {
    label: 'Commissioning',
    workPackages: wps('common', 'commissioning', [
      ['electrical_final',       'Electrical Final Commissioning',     { openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'GC' }],
      ['hvac_final',             'HVAC Final Balancing / Commissioning', { openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'GC' }],
      ['fire_alarm_test',        'Fire Alarm Scenario Test',            { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['smoke_extraction_test',  'Smoke Extraction Integrated Test',    { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['sprinkler_fhc_test',     'Sprinkler / FHC Acceptance Test',     { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['bms_integration',        'BMS / Controls Integration',          { openingBlocker: 'soft', typicalClearDays: 3, responsibleRole: 'GC' }],
      ['integrated_systems_test','Integrated Systems Test',             { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 4, responsibleRole: 'GC' }],
    ]),
  },
  'common.pre_opening': {
    label: 'Pre-Opening',
    workPackages: wps('common', 'pre_opening', [
      ['test_reports',        'Test Reports / Certificates Package',    { openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'PM' }],
      ['authority_approvals', 'Authority / Landlord Opening Approvals', { openingBlocker: 'critical', typicalClearDays: 5, responsibleRole: 'Landlord' }],
      ['final_walkthrough',   'Final Readiness Walkthrough',            { openingBlocker: 'soft', typicalClearDays: 1, responsibleRole: 'PM' }],
    ]),
  },
  'common.handover': {
    label: 'Handover',
    workPackages: wps('common', 'handover', [
      ['final_inspection',  'Final Inspection',                { openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'Landlord' }],
      ['snag_closure',      'Final Snag Closure Confirmation', { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['acceptance_act',    'Acceptance & Transfer Act',       { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'Landlord' }],
      ['keys_possession',   'Keys & Possession',               { isBlocker: true, openingBlocker: 'critical', typicalClearDays: 1, responsibleRole: 'Landlord' }],
      ['om_manuals',        'O&M Manuals / Warranty Package',  { openingBlocker: 'soft', typicalClearDays: 2, responsibleRole: 'GC' }],
    ]),
  },

  // ── Sales Area ──────────────────────────────────────────────────────────
  'sales.flooring': {
    label: 'Flooring Works',
    workPackages: wps('sales', 'flooring', [
      ['waterproof', 'Waterproofing / Surface Preparation', { isBlocker: true }],
      ['tile',       'Floor Tile Installation'],
      ['grout',      'Grouting / Protection'],
    ]),
  },
  'sales.construction': {
    label: 'Construction Works',
    workPackages: wps('sales', 'construction', [
      ['wall_framing',  'Wall Framing / Partitions'],
      ['rough_ceiling', 'Rough Ceiling Installation'],
      ['wall_closing',  'Wall Board & Closing'],
    ]),
  },
  'sales.mep_install': {
    label: 'MEP Installation Works',
    workPackages: wps('sales', 'mep_install', [
      ['elec_trays',    'Electrical Cable Trays / Conduits'],
      ['elec_cabling',  'Electrical Power Cabling'],
      ['hvac_ductwork', 'HVAC Ductwork'],
      ['hvac_piping',   'HVAC Piping / Refrigerant Lines'],
      ['water_supply',  'Water Supply Installation'],
      ['drainage',      'Drainage / Wastewater Installation'],
    ]),
  },
  'sales.finishing': {
    label: 'Finishing Works',
    workPackages: wps('sales', 'finishing', [
      ['wall_paint',    'Wall Plaster / Putty / Paint'],
      ['wall_cladding', 'Wall Cladding / Special Finishes'],
      ['ceiling_grid',  'Ceiling Grid / Gypsum Ceiling'],
      ['ceiling_final', 'Ceiling Final Finish'],
      ['skirting',      'Skirting / Trims'],
      ['doors',         'Doors / Hardware'],
      ['signage_prep',  'Signage / Branding Preparation'],
    ]),
  },
  'sales.end_devices': {
    label: 'End Devices',
    workPackages: wps('sales', 'end_devices', [
      ['general_lighting',   'General Lighting Fixtures'],
      ['emergency_lighting', 'Emergency Lighting / Exit Signs', { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['sockets_switches',   'Sockets / Switches / Floor Boxes'],
      ['hvac_grilles',       'HVAC Grilles / Diffusers / Thermostats'],
      ['fire_detectors',     'Fire Detectors / Manual Call Points', { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['audio_pa',           'Audio / PA / Music Equipment'],
      ['access_control',     'Access Control / Security Devices'],
      ['cctv',               'CCTV / Low Current Devices'],
    ]),
  },
  'sales.furniture': {
    label: 'Furniture',
    workPackages: wps('sales', 'furniture', [
      ['sales_furniture', 'Sales Floor Furniture'],
      ['cash_desk',       'Cash Desk', { isBlocker: true }],
      ['fitting_rooms',   'Fitting Rooms'],
    ]),
  },
  'sales.pre_opening': {
    label: 'Pre-Opening',
    workPackages: wps('sales', 'pre_opening', [
      ['deep_cleaning', 'Deep Cleaning',  { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['staff_training','Staff Training', { openingBlocker: 'soft', typicalClearDays: 3, responsibleRole: 'PM' }],
    ]),
  },
  'sales.commissioning': {
    label: 'Commissioning',
    workPackages: wps('sales', 'commissioning', [
      ['snagging', 'Snagging / Punch List Closure', { openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'GC' }],
    ]),
  },

  // ── Back of House ───────────────────────────────────────────────────────
  'boh.flooring': {
    label: 'Flooring Works',
    workPackages: wps('boh', 'flooring', [
      ['waterproof', 'Waterproofing / Surface Preparation', { isBlocker: true }],
      ['tile',       'Floor Tile Installation'],
      ['grout',      'Grouting / Protection'],
    ]),
  },
  'boh.construction': {
    label: 'Construction Works',
    workPackages: wps('boh', 'construction', [
      ['wall_framing',  'Wall Framing / Partitions'],
      ['rough_ceiling', 'Rough Ceiling Installation'],
      ['wall_closing',  'Wall Board & Closing'],
    ]),
  },
  'boh.mep_install': {
    label: 'MEP Installation Works',
    workPackages: wps('boh', 'mep_install', [
      ['elec_trays',        'Electrical Cable Trays / Conduits'],
      ['elec_cabling',      'Electrical Power Cabling'],
      ['hvac_ductwork',     'HVAC Ductwork'],
      ['hvac_piping',       'HVAC Piping / Refrigerant Lines'],
      ['water_supply',      'Water Supply Installation'],
      ['drainage',          'Drainage / Wastewater Installation'],
      ['sanitary_connect',  'Sanitary Connection Installation', { isBlocker: true }],
    ]),
  },
  'boh.finishing': {
    label: 'Finishing Works',
    workPackages: wps('boh', 'finishing', [
      ['wall_paint',    'Wall Plaster / Putty / Paint'],
      ['ceiling_grid',  'Ceiling Grid / Gypsum Ceiling'],
      ['ceiling_final', 'Ceiling Final Finish'],
      ['skirting',      'Skirting / Trims'],
      ['doors',         'Doors / Hardware'],
    ]),
  },
  'boh.end_devices': {
    label: 'End Devices',
    workPackages: wps('boh', 'end_devices', [
      ['general_lighting',   'General Lighting Fixtures'],
      ['emergency_lighting', 'Emergency Lighting / Exit Signs', { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['sockets_switches',   'Sockets / Switches / Floor Boxes'],
      ['hvac_grilles',       'HVAC Grilles / Diffusers / Thermostats'],
      ['fire_detectors',     'Fire Detectors / Manual Call Points', { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
      ['access_control',     'Access Control / Security Devices'],
      ['cctv',               'CCTV / Low Current Devices'],
    ]),
  },
  'boh.furniture': {
    label: 'Furniture',
    workPackages: wps('boh', 'furniture', [
      ['boh_furniture', 'Back of House Furniture'],
    ]),
  },
  'boh.pre_opening': {
    label: 'Pre-Opening',
    workPackages: wps('boh', 'pre_opening', [
      ['deep_cleaning', 'Deep Cleaning', { openingBlocker: 'critical', typicalClearDays: 2, responsibleRole: 'GC' }],
    ]),
  },
  'boh.commissioning': {
    label: 'Commissioning',
    workPackages: wps('boh', 'commissioning', [
      ['snagging', 'Snagging / Punch List Closure', { openingBlocker: 'critical', typicalClearDays: 3, responsibleRole: 'GC' }],
    ]),
  },
};

export const retailFitoutV2 = {
  id: 'retail-fitout-v2',
  version: 'v2',
  label: 'Retail Fit-Out (Zoned)',
  zones: [
    {
      id: 'common', label: 'Common Works', weightMode: 'fixed', fixedWeight: 35,
      categories: [
        { id: 'common.demolition',    weight: 8 },
        { id: 'common.floor_prep',    weight: 5 },
        { id: 'common.construction',  weight: 15 },
        { id: 'common.mep_backbone',  weight: 40 },
        { id: 'common.commissioning', weight: 15 },
        { id: 'common.pre_opening',   weight: 7 },
        { id: 'common.handover',      weight: 10 },
      ],
    },
    {
      id: 'sales', label: 'Sales Area', weightMode: 'area', defaultWeight: 45, areaField: 'salesAreaSqm',
      categories: [
        { id: 'sales.flooring',      weight: 10 },
        { id: 'sales.construction',  weight: 12 },
        { id: 'sales.mep_install',   weight: 25 },
        { id: 'sales.finishing',     weight: 20 },
        { id: 'sales.end_devices',   weight: 18 },
        { id: 'sales.furniture',     weight: 8 },
        { id: 'sales.pre_opening',   weight: 4 },
        { id: 'sales.commissioning', weight: 3 },
      ],
    },
    {
      id: 'boh', label: 'Back of House', weightMode: 'area', defaultWeight: 20, areaField: 'bohAreaSqm',
      categories: [
        { id: 'boh.flooring',      weight: 12 },
        { id: 'boh.construction',  weight: 15 },
        { id: 'boh.mep_install',   weight: 30 },
        { id: 'boh.finishing',     weight: 15 },
        { id: 'boh.end_devices',   weight: 15 },
        { id: 'boh.furniture',     weight: 5 },
        { id: 'boh.pre_opening',   weight: 5 },
        { id: 'boh.commissioning', weight: 3 },
      ],
    },
  ],
};

// Flat WP list across every zone/category — mirrors masterTaskLibrary.js's
// WORK_PACKAGES shape (id + phaseId) so getScopeWPIds/computeSPIFromTasks/
// computeCriticalHealth work unchanged for v2: phaseId is set to the WP's
// zoneId (the same "flat scope-filtering key" role phaseId plays for v1 —
// see getScopeWPIds.js, which only ever reads wp.id/wp.phaseId generically).
export const ALL_WORK_PACKAGES_V2 = retailFitoutV2.zones.flatMap(zone =>
  zone.categories.flatMap(cat =>
    (CATEGORY_LIBRARY[cat.id]?.workPackages ?? []).map(wp => ({
      ...wp,
      phaseId: zone.id,       // scope-filtering compatibility key (see getScopeWPIds.js)
      zoneId: zone.id,
      categoryId: cat.id,
    }))
  )
);

export function getWPByIdV2(wpId) {
  return ALL_WORK_PACKAGES_V2.find(wp => wp.id === wpId) || null;
}
