// dependencyRulesV2.test.mjs — DAG validity + shape contract for the v2
// dependency chain (real cross-category/cross-zone sequencing, not a flat list).
// Run: node src/config/dependencyRulesV2.test.mjs

import { DEPENDENCY_RULES_V2, filterRulesForWPsV2 } from './dependencyRulesV2.js';
import { ALL_WORK_PACKAGES_V2 } from '../domains/construction/templates/retailFitoutV2.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const allWpIds = ALL_WORK_PACKAGES_V2.map(wp => wp.id);
const allWpIdSet = new Set(allWpIds);

console.log('\nDEPENDENCY_RULES_V2 — referential integrity');
{
  const badRules = DEPENDENCY_RULES_V2.filter(r => !allWpIdSet.has(r.from) || !allWpIdSet.has(r.to));
  check('every rule references only real v2 WP ids', badRules.length === 0);
  check('rules is not a flat/trivial list (spans multiple zones + common)', DEPENDENCY_RULES_V2.length > 100);
}

console.log('\nDEPENDENCY_RULES_V2 — DAG validity (Kahn\'s algorithm, no cycles)');
{
  const inDegree = {};
  const successors = {};
  for (const id of allWpIds) { inDegree[id] = 0; successors[id] = []; }
  for (const r of DEPENDENCY_RULES_V2) {
    inDegree[r.to] = (inDegree[r.to] || 0) + 1;
    successors[r.from].push(r.to);
  }
  const queue = allWpIds.filter(id => inDegree[id] === 0);
  const sorted = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    sorted.push(cur);
    for (const to of successors[cur]) {
      inDegree[to]--;
      if (inDegree[to] === 0) queue.push(to);
    }
  }
  check('topological sort visits every WP exactly once (no cycle)', sorted.length === allWpIds.length);

  const rootWPs = allWpIds.filter(id => inDegree[id] === 0 || (successors[id] !== undefined && !DEPENDENCY_RULES_V2.some(r => r.to === id)));
  check('common.demolition WPs have no predecessors (true chain roots)',
    ['common.demolition.strip_out', 'common.demolition.structural', 'common.demolition.mep_disconnect']
      .every(id => !DEPENDENCY_RULES_V2.some(r => r.to === id)));
  check('common.handover.keys_possession has no successors (true chain end)',
    !DEPENDENCY_RULES_V2.some(r => r.from === 'common.handover.keys_possession'));
  void rootWPs;
}

console.log('\nDEPENDENCY_RULES_V2 — real chain semantics (not a flat list)');
{
  check('floor_prep -> construction has a 10-day drying lag',
    DEPENDENCY_RULES_V2.some(r => r.from === 'common.floor_prep.screed' && r.to === 'common.construction.wall_marking' && r.lag_days === 10));

  check('flooring has an internal waterproof -> tile -> grout sequence (sales)',
    DEPENDENCY_RULES_V2.some(r => r.from === 'sales.flooring.waterproof' && r.to === 'sales.flooring.tile') &&
    DEPENDENCY_RULES_V2.some(r => r.from === 'sales.flooring.tile' && r.to === 'sales.flooring.grout'));

  check('cross-zone: common.mep_backbone gates sales.mep_install (all 8 backbone WPs -> all sales MEP WPs)',
    DEPENDENCY_RULES_V2.filter(r => r.from.startsWith('common.mep_backbone.') && r.to.startsWith('sales.mep_install.')).length === 8 * 6);

  check('cross-zone: both zones\' snagging gate the common integrated systems test',
    DEPENDENCY_RULES_V2.some(r => r.from === 'sales.commissioning.snagging' && r.to === 'common.commissioning.integrated_systems_test') &&
    DEPENDENCY_RULES_V2.some(r => r.from === 'boh.commissioning.snagging' && r.to === 'common.commissioning.integrated_systems_test'));

  check('handover has a real internal sequence (inspection before keys), not a flat AND-gate',
    DEPENDENCY_RULES_V2.some(r => r.from === 'common.handover.final_inspection' && r.to === 'common.handover.snag_closure') &&
    !DEPENDENCY_RULES_V2.some(r => r.from === 'common.handover.keys_possession' && r.to === 'common.handover.final_inspection'));
}

console.log('\nfilterRulesForWPsV2');
{
  const salesOnly = ALL_WORK_PACKAGES_V2.filter(wp => wp.zoneId === 'sales').map(wp => wp.id);
  const filtered = filterRulesForWPsV2(salesOnly);
  check('filtered rules only reference sales WPs on both ends', filtered.every(r => salesOnly.includes(r.from) && salesOnly.includes(r.to)));
  check('cross-zone rules (common <-> sales) are dropped when common is out of scope',
    !filtered.some(r => r.from.startsWith('common.') || r.to.startsWith('common.')));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
