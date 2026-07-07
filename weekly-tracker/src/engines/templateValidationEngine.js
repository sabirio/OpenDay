const EPS = 0.001;

function checkWeightSum(phases) {
  const sum = phases.reduce((s, p) => s + (p.progressWeight || 0), 0);
  if (Math.abs(sum - 100) > EPS) {
    return [{ severity: 'error', code: 'WEIGHT_SUM',
      message: `Phase progressWeights sum to ${sum.toFixed(4)}, expected 100.` }];
  }
  return [];
}

function checkDurationSums(phases, wps) {
  const issues = [];
  for (const phase of phases) {
    const phaseWPs = wps.filter(wp => wp.phaseId === phase.id);
    if (phaseWPs.length === 0) continue;
    const sum = phaseWPs.reduce((s, wp) => s + (wp.duration_pct || 0), 0);
    if (Math.abs(sum - 1) > EPS) {
      issues.push({ severity: 'error', code: 'DURATION_SUM',
        message: `Phase "${phase.id}" work package duration_pct sums to ${sum.toFixed(4)}, expected 1.00.` });
    }
  }
  return issues;
}

function checkDupPhaseIds(phases) {
  const seen = new Set(), issues = [];
  for (const p of phases) {
    if (seen.has(p.id)) {
      issues.push({ severity: 'error', code: 'DUP_PHASE_ID',
        message: `Duplicate phase id "${p.id}".` });
    }
    seen.add(p.id);
  }
  return issues;
}

function checkDupWPIds(wps) {
  const seen = new Set(), issues = [];
  for (const wp of wps) {
    if (seen.has(wp.id)) {
      issues.push({ severity: 'error', code: 'DUP_WP_ID',
        message: `Duplicate work package id "${wp.id}".` });
    }
    seen.add(wp.id);
  }
  return issues;
}

function checkOrphanWPs(phases, wps) {
  const phaseIdSet = new Set(phases.map(p => p.id));
  return wps
    .filter(wp => !phaseIdSet.has(wp.phaseId))
    .map(wp => ({ severity: 'error', code: 'ORPHAN_WP',
      message: `Work package "${wp.id}" references unknown phase "${wp.phaseId}".` }));
}

function checkRanges(phases, wps) {
  const issues = [];
  for (const p of phases) {
    if ((p.progressWeight || 0) < 0) {
      issues.push({ severity: 'error', code: 'RANGE',
        message: `Phase "${p.id}" has negative progressWeight (${p.progressWeight}).` });
    }
  }
  for (const wp of wps) {
    const d = wp.duration_pct;
    if (d !== undefined && d !== null && (d < 0 || d > 1)) {
      issues.push({ severity: 'error', code: 'RANGE',
        message: `Work package "${wp.id}" has duration_pct ${d} outside [0, 1].` });
    }
  }
  return issues;
}

function checkEmptyPhases(phases, wps) {
  const referenced = new Set(wps.map(wp => wp.phaseId));
  return phases
    .filter(p => !referenced.has(p.id))
    .map(p => ({ severity: 'warning', code: 'EMPTY_PHASE',
      message: `Phase "${p.id}" has no work packages.` }));
}

function checkDupOrders(phases) {
  const seen = new Set(), issues = [];
  for (const p of phases) {
    if (p.order !== undefined && p.order !== null) {
      if (seen.has(p.order)) {
        issues.push({ severity: 'warning', code: 'DUP_ORDER',
          message: `Duplicate phase order value ${p.order} (phase "${p.id}").` });
      }
      seen.add(p.order);
    }
  }
  return issues;
}

export function validateTemplate(template) {
  const phases = Array.isArray(template?.phases) ? template.phases : [];
  const wps    = Array.isArray(template?.workPackages) ? template.workPackages : [];

  const errors = [
    ...checkWeightSum(phases),
    ...checkDurationSums(phases, wps),
    ...checkDupPhaseIds(phases),
    ...checkDupWPIds(wps),
    ...checkOrphanWPs(phases, wps),
    ...checkRanges(phases, wps),
  ];

  const warnings = [
    ...checkEmptyPhases(phases, wps),
    ...checkDupOrders(phases),
  ];

  return [...errors, ...warnings];
}

export function isTemplateValid(template) {
  return validateTemplate(template).every(issue => issue.severity !== 'error');
}
