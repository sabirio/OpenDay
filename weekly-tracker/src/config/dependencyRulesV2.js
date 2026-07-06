// dependencyRulesV2.js — Finish-to-Start dependency chain for retailFitoutV2.
// Fully isolated from dependencyRules.js (v1) — no shared rules, no shared
// WP ids, so v1 projects are completely unaffected.
//
// type: "FS" = Finish-to-Start (only type used in this system, matches v1).
// lag_days: waiting time after predecessor finishes before successor can start.
//
// Chain design (ASSUMPTION — a plausible, non-flat construction sequence;
// exact lag durations beyond the two explicitly-reasoned ones below are
// nominal placeholders a real scheduler would tune per project):
//   Common:  demolition -> floor_prep -> construction -> mep_backbone ->
//            commissioning -> pre_opening -> handover
//   Zone (Sales/BoH, identical structure per zone):
//            flooring (waterproof -> tile -> grout) -> construction ->
//            mep_install -> finishing -> end_devices -> furniture ->
//            commissioning (snagging) -> pre_opening (cleaning/training)
//   Cross-zone:
//     - common.mep_backbone (ALL 8 WPs) -> each zone's mep_install (ALL WPs)
//       — the shared electrical/HVAC/fire backbone must exist before a zone
//       can tie into it.
//     - each zone's commissioning (snagging) -> common's integrated systems
//       test — the building-wide final test needs every zone already
//       snagged, not just common works.
//
// Every "stage A -> stage B" transition is a full AND-gate (every WP in A
// must finish before ANY WP in B can start) — same semantics as v1's
// "ALL tests + floor.tiling -> walls.closing" pattern, just generated
// programmatically here since v2 stages have far more WPs per stage than v1.

import { CATEGORY_LIBRARY } from '../domains/construction/templates/retailFitoutV2.js';

function ids(categoryId) {
  return (CATEGORY_LIBRARY[categoryId]?.workPackages ?? []).map(wp => wp.id);
}

function andGate(fromIds, toIds, lag_days = 0) {
  const rules = [];
  for (const from of fromIds) {
    for (const to of toIds) {
      rules.push({ from, to, type: 'FS', lag_days });
    }
  }
  return rules;
}

function sequence(idList, lag_days = 0) {
  const rules = [];
  for (let i = 0; i < idList.length - 1; i++) {
    rules.push({ from: idList[i], to: idList[i + 1], type: 'FS', lag_days });
  }
  return rules;
}

// ── Common Works internal chain ───────────────────────────────────────────
const commonDemolition   = ids('common.demolition');
const commonFloorPrep    = ids('common.floor_prep');   // single WP: screed
const commonConstruction = ids('common.construction');
const commonMepBackbone  = ids('common.mep_backbone');
const commonCommissioning = ids('common.commissioning');
const commonPreOpening   = ids('common.pre_opening');

const commonChain = [
  ...andGate(commonDemolition, commonFloorPrep),
  // Screed needs a drying/curing lag before anything builds on top of it —
  // same 10-day figure v1's floor.screed -> * uses.
  ...andGate(commonFloorPrep, commonConstruction, 10),
  ...andGate(commonConstruction, commonMepBackbone),
  ...andGate(commonMepBackbone, commonCommissioning),
  ...andGate(commonCommissioning, commonPreOpening),
  // Handover has a real internal sequence, not a flat AND-gate: inspection
  // must happen before snag closure is even meaningful, before acceptance,
  // before keys; O&M manuals just need snagging closed, not the full chain.
  ...sequence(['common.handover.final_inspection', 'common.handover.snag_closure', 'common.handover.acceptance_act', 'common.handover.keys_possession']),
  ...andGate(['common.handover.snag_closure'], ['common.handover.om_manuals']),
  ...andGate(commonPreOpening, ['common.handover.final_inspection']),
];

// ── Per-zone internal chain (identical structure for sales + boh) ────────
function zoneChain(zonePrefix) {
  const flooringWaterproof = `${zonePrefix}.flooring.waterproof`;
  const flooringTile       = `${zonePrefix}.flooring.tile`;
  const flooringGrout      = `${zonePrefix}.flooring.grout`;
  const construction = ids(`${zonePrefix}.construction`);
  const mepInstall    = ids(`${zonePrefix}.mep_install`);
  const finishing     = ids(`${zonePrefix}.finishing`);
  const endDevices    = ids(`${zonePrefix}.end_devices`);
  const furniture     = ids(`${zonePrefix}.furniture`);
  const commissioning = ids(`${zonePrefix}.commissioning`);
  const preOpening    = ids(`${zonePrefix}.pre_opening`);

  return [
    // Flooring's own internal sequence: waterproofing needs a short cure
    // before tiling, then grouting/protection after tiling.
    { from: flooringWaterproof, to: flooringTile, type: 'FS', lag_days: 2 },
    { from: flooringTile,       to: flooringGrout, type: 'FS', lag_days: 0 },
    ...andGate([flooringGrout], construction),
    ...andGate(construction, mepInstall),
    ...andGate(mepInstall, finishing),
    ...andGate(finishing, endDevices),
    ...andGate(endDevices, furniture),
    ...andGate(furniture, commissioning),
    ...andGate(commissioning, preOpening),
  ];
}

// ── Cross-zone rules ───────────────────────────────────────────────────────
const crossZoneRules = [
  // Shared MEP backbone must exist before either zone ties into it.
  ...andGate(commonMepBackbone, ids('sales.mep_install')),
  ...andGate(commonMepBackbone, ids('boh.mep_install')),
  // Every zone's local snagging must close before the building-wide
  // integrated systems test can run.
  ...andGate(ids('sales.commissioning'), ['common.commissioning.integrated_systems_test']),
  ...andGate(ids('boh.commissioning'),   ['common.commissioning.integrated_systems_test']),
];

export const DEPENDENCY_RULES_V2 = [
  ...commonChain,
  ...zoneChain('sales'),
  ...zoneChain('boh'),
  ...crossZoneRules,
];

/**
 * Filter rules to only those where BOTH from and to WP IDs exist in the given set.
 * @param {string[]} wpIds
 * @returns DEPENDENCY_RULES_V2 subset
 */
export function filterRulesForWPsV2(wpIds) {
  const set = new Set(wpIds);
  return DEPENDENCY_RULES_V2.filter(r => set.has(r.from) && set.has(r.to));
}
