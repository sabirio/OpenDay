// Central Work Packages configuration — single source of truth for all progress,
// contractor reports, PM site visits, and risk scoring.
//
// Each WP has:
//  - tasks[]  — flat weighted list (backward-compat with computePackageProgress + Supabase data)
//  - groups[] — two-level UI structure; group.tasks = array of task name strings

export const WORK_PACKAGES = [
  {
    id: 'preconstruction',
    name: 'Pre-construction',
    weight: 0.05,
    groups: [
      { id: 'precon.g.setup',    name: 'Site setup & hoarding',    tasks: ['Site setup & hoarding'] },
      { id: 'precon.g.utils',    name: 'Temporary utilities',       tasks: ['Temporary utilities'] },
      { id: 'precon.g.drawings', name: 'Shop drawings approval',    tasks: ['Shop drawings approval'] },
      { id: 'precon.g.proc',     name: 'Material procurement',      tasks: ['Material procurement'] },
    ],
    tasks: [
      { name: 'Site setup & hoarding', weight: 40 },
      { name: 'Temporary utilities',   weight: 30 },
      { name: 'Shop drawings approval', weight: 20 },
      { name: 'Material procurement',  weight: 10 },
    ],
  },
  {
    id: 'demolition',
    name: 'Demolition & Preparation',
    weight: 0.05,
    groups: [
      { id: 'demo.g.demolition', name: 'Demolition & waste removal', tasks: ['Demolition works', 'Waste removal & disposal'] },
      { id: 'demo.g.surface',    name: 'Surface preparation',        tasks: ['Surface preparation'] },
    ],
    tasks: [
      { name: 'Demolition works',       weight: 60 },
      { name: 'Waste removal & disposal', weight: 25 },
      { name: 'Surface preparation',    weight: 15 },
    ],
  },
  {
    id: 'construction',
    name: 'Construction',
    weight: 0.20,
    groups: [
      { id: 'con.g.floor',      name: 'Floor preparation & screed',     tasks: ['Floor preparation & screed'] },
      { id: 'con.g.partitions', name: 'Partitions & drywall',           tasks: ['Partitions & drywall'] },
      { id: 'con.g.openings',   name: 'Openings & structural works',    tasks: ['Openings & structural works'] },
      { id: 'con.g.ceiling',    name: 'Ceiling structures',             tasks: ['Ceiling structures'] },
      { id: 'con.g.wptiling',   name: 'Waterproofing, tiling & cladding', tasks: ['Waterproofing', 'Tiling & cladding'] },
    ],
    tasks: [
      { name: 'Floor preparation & screed', weight: 15 },
      { name: 'Partitions & drywall',       weight: 20 },
      { name: 'Openings & structural works', weight: 15 },
      { name: 'Ceiling structures',          weight: 20 },
      { name: 'Waterproofing',               weight: 10 },
      { name: 'Tiling & cladding',           weight: 20 },
    ],
  },
  {
    id: 'mep',
    name: 'MEP Installation',
    weight: 0.25,
    groups: [
      { id: 'mep.g.hvac',      name: 'HVAC installation',           tasks: ['HVAC ducts', 'HVAC pipes & equipment'] },
      { id: 'mep.g.elec',      name: 'Electrical installation',     tasks: ['Electrical conduits & cabling', 'Electrical panels & distribution'] },
      { id: 'mep.g.plumb',     name: 'Plumbing installation',       tasks: ['Plumbing rough-in'] },
      { id: 'mep.g.fire',      name: 'Fire protection systems',     tasks: ['Fire suppression pipes', 'Fire alarm cabling'] },
      { id: 'mep.g.security',  name: 'Security & access systems',   tasks: ['Access control rough-in', 'CCTV & security rough-in'] },
      { id: 'mep.g.it',        name: 'IT, network & low current',   tasks: ['IT & network infrastructure', 'Low current systems', 'Audio / PA rough-in'] },
      { id: 'mep.g.bms',       name: 'BMS & emergency systems',     tasks: ['BMS integration', 'Emergency lighting', 'UPS & power backup'] },
      { id: 'mep.g.earthing',  name: 'Earthing & lightning protection', tasks: ['Earthing & bonding', 'Lightning protection'] },
    ],
    tasks: [
      { name: 'HVAC ducts',                      weight: 8 },
      { name: 'HVAC pipes & equipment',          weight: 8 },
      { name: 'Electrical conduits & cabling',   weight: 10 },
      { name: 'Electrical panels & distribution', weight: 8 },
      { name: 'Plumbing rough-in',               weight: 6 },
      { name: 'Fire suppression pipes',          weight: 8 },
      { name: 'Fire alarm cabling',              weight: 6 },
      { name: 'Low current systems',             weight: 6 },
      { name: 'Access control rough-in',         weight: 5 },
      { name: 'CCTV & security rough-in',        weight: 5 },
      { name: 'IT & network infrastructure',     weight: 7 },
      { name: 'Audio / PA rough-in',             weight: 4 },
      { name: 'BMS integration',                 weight: 5 },
      { name: 'Emergency lighting',              weight: 4 },
      { name: 'UPS & power backup',              weight: 5 },
      { name: 'Lightning protection',            weight: 3 },
      { name: 'Earthing & bonding',              weight: 2 },
    ],
  },
  {
    id: 'finishes',
    name: 'Finishes & Final Installation',
    weight: 0.20,
    groups: [
      { id: 'fin.g.paint',    name: 'Painting & wall finishes',              tasks: ['Painting & coatings', 'Wall finishes'] },
      { id: 'fin.g.floors',   name: 'Floor & ceiling finishes',              tasks: ['Floor finishes', 'Ceiling finishes'] },
      { id: 'fin.g.joinery',  name: 'Joinery & millwork',                    tasks: ['Joinery & millwork'] },
      { id: 'fin.g.glazing',  name: 'Glazing, shopfront & doors',            tasks: ['Glazing & shopfront', 'Doors & hardware'] },
      { id: 'fin.g.signage',  name: 'Signage & branding',                    tasks: ['Signage & branding elements'] },
      { id: 'fin.g.lighting', name: 'Lighting fixtures, grilles & diffusers', tasks: ['Lighting fixtures', 'Grilles & diffusers'] },
      { id: 'fin.g.trims',    name: 'Skirting, trims & speciality finishes', tasks: ['Skirting & trims', 'Speciality finishes'] },
      { id: 'fin.g.ext',      name: 'External works & façade',               tasks: ['External works & façade'] },
    ],
    tasks: [
      { name: 'Painting & coatings',        weight: 10 },
      { name: 'Floor finishes',             weight: 12 },
      { name: 'Ceiling finishes',           weight: 10 },
      { name: 'Wall finishes',              weight: 10 },
      { name: 'Joinery & millwork',         weight: 10 },
      { name: 'Glazing & shopfront',        weight: 8 },
      { name: 'Doors & hardware',           weight: 8 },
      { name: 'Signage & branding elements', weight: 6 },
      { name: 'Lighting fixtures',          weight: 10 },
      { name: 'Grilles & diffusers',        weight: 6 },
      { name: 'Skirting & trims',           weight: 5 },
      { name: 'Speciality finishes',        weight: 3 },
      { name: 'External works & façade',    weight: 2 },
    ],
  },
  {
    id: 'equipment',
    name: 'Fixtures & Equipment',
    weight: 0.10,
    groups: [
      { id: 'eq.g.retail',   name: 'Retail equipment & displays',        tasks: ['Retail equipment & displays'] },
      { id: 'eq.g.furniture', name: 'Furniture & loose items',           tasks: ['Furniture & loose items'] },
      { id: 'eq.g.pos',      name: 'Cash area / POS setup',              tasks: ['Cash area / POS setup'] },
      { id: 'eq.g.storage',  name: 'Storage, shelving & Back of House',  tasks: ['Storage & shelving systems', 'Back of House fit-out'] },
    ],
    tasks: [
      { name: 'Retail equipment & displays', weight: 25 },
      { name: 'Furniture & loose items',     weight: 20 },
      { name: 'Cash area / POS setup',       weight: 20 },
      { name: 'Storage & shelving systems',  weight: 20 },
      { name: 'Back of House fit-out',       weight: 15 },
    ],
  },
  {
    id: 'commissioning',
    name: 'Testing & Commissioning',
    weight: 0.10,
    groups: [
      { id: 'com.g.mep',      name: 'MEP testing',                   tasks: ['HVAC balancing & commissioning', 'Electrical testing & certification'] },
      { id: 'com.g.fire',     name: 'Fire & life safety testing',     tasks: ['Sprinkler testing & commissioning', 'Fire alarm testing'] },
      { id: 'com.g.security', name: 'Security & IT systems testing',  tasks: ['Security & access control testing', 'IT & POS integration testing'] },
      { id: 'com.g.bms',      name: 'BMS commissioning',              tasks: ['BMS commissioning'] },
      { id: 'com.g.integrated', name: 'Integrated systems testing',   tasks: ['Integrated systems testing'] },
    ],
    tasks: [
      { name: 'HVAC balancing & commissioning',    weight: 15, openingBlocker: 'critical' },
      { name: 'Electrical testing & certification', weight: 15, openingBlocker: 'critical' },
      { name: 'Sprinkler testing & commissioning',  weight: 15, openingBlocker: 'critical' },
      { name: 'Fire alarm testing',                 weight: 12, openingBlocker: 'critical' },
      { name: 'Security & access control testing',  weight: 10, openingBlocker: 'soft' },
      { name: 'IT & POS integration testing',       weight: 10, openingBlocker: 'soft' },
      { name: 'BMS commissioning',                  weight: 8,  openingBlocker: 'soft' },
      { name: 'Integrated systems testing',         weight: 15, openingBlocker: 'critical' },
    ],
  },
  {
    id: 'handover',
    name: 'Snagging & Handover',
    weight: 0.05,
    groups: [
      { id: 'hov.g.snag',   name: 'Defects & snagging resolution', tasks: ['Defects & snagging resolution'] },
      { id: 'hov.g.clean',  name: 'Final cleaning',                tasks: ['Final cleaning'] },
      { id: 'hov.g.train',  name: 'Staff training',                tasks: ['Staff training'] },
      { id: 'hov.g.docs',   name: 'Documentation handover',        tasks: ['O&M manuals', 'Certificates & warranties'] },
      { id: 'hov.g.auth',   name: 'Authority approvals & permits', tasks: ['Authority approvals & permits'] },
    ],
    tasks: [
      { name: 'Defects & snagging resolution', weight: 25, openingBlocker: 'critical' },
      { name: 'Final cleaning',                weight: 15, openingBlocker: 'critical' },
      { name: 'Staff training',                weight: 15, openingBlocker: 'soft' },
      { name: 'O&M manuals',                   weight: 15, openingBlocker: 'soft' },
      { name: 'Certificates & warranties',     weight: 15, openingBlocker: 'critical' },
      { name: 'Authority approvals & permits', weight: 15, openingBlocker: 'critical' },
    ],
  },
];

// ─── Status scoring ───────────────────────────────────────────────────────────

export const WP_STATUS_OPTIONS = [
  'Not Applicable',
  'Not Started',
  'In Progress',
  'Completed',
];

export const WP_STATUS_SCORES = {
  'Not Started': 0,
  'In Progress': 0.5,
  Delayed: 0.3,
  Completed: 1,
  'Not Applicable': null,
};

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getPackageById(id) {
  return WORK_PACKAGES.find(wp => wp.id === id) || null;
}

export function getAllTaskNames() {
  return WORK_PACKAGES.flatMap(wp => wp.tasks.map(t => t.name));
}

// Returns groups for a WP, falling back to single-task groups if wp.groups is absent.
export function getWPGroups(wpId) {
  const wp = getPackageById(wpId);
  if (!wp) return [];
  return wp.groups ?? wp.tasks.map(t => ({ id: t.name, name: t.name, tasks: [t.name] }));
}

// ─── Empty status builders ────────────────────────────────────────────────────

export function makeEmptyWPStatuses() {
  const result = {};
  for (const wp of WORK_PACKAGES) {
    result[wp.id] = {};
    for (const task of wp.tasks) {
      result[wp.id][task.name] = { status: 'Not Started', progress: 0, comment: '', photo: null, risk: false };
    }
  }
  return result;
}

export function makeEmptyPMWPStatuses() {
  const result = {};
  for (const wp of WORK_PACKAGES) {
    result[wp.id] = {};
    for (const task of wp.tasks) {
      result[wp.id][task.name] = { observedStatus: '', progress: 0, issueFound: false, riskLevel: 'None', comment: '', photo: null };
    }
  }
  return result;
}

// ─── Progress computation ─────────────────────────────────────────────────────

export function computePackageProgress(wpStatuses, wpId) {
  const wp = getPackageById(wpId);
  if (!wp || !wpStatuses) return 0;
  const taskMap = wpStatuses[wpId] || {};
  let totalWeight = 0;
  let weightedScore = 0;
  for (const task of wp.tasks) {
    const entry = taskMap[task.name];
    if (!entry) continue;
    const score = WP_STATUS_SCORES[entry.status];
    if (score == null) continue;
    const effectiveProgress = entry.progress > 0 ? entry.progress / 100 : score;
    totalWeight += task.weight;
    weightedScore += task.weight * effectiveProgress;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedScore / totalWeight) * 100);
}

// DEPRECATED — uses old workPackages.js task key scheme; returns 0 for Gantt-format data.
// Use calculateProjectProgress() from progressEngine.js instead.
export function computeProjectProgressFromWP(wpStatuses) {
  if (!wpStatuses) return 0;
  let totalWeight = 0;
  let weightedScore = 0;
  for (const wp of WORK_PACKAGES) {
    const pkgProgress = computePackageProgress(wpStatuses, wp.id);
    totalWeight += wp.weight;
    weightedScore += wp.weight * (pkgProgress / 100);
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedScore / totalWeight) * 100);
}

// DEPRECATED — uses old workPackages.js task key scheme; silently drops Gantt task entries.
// Use mergeGanttWPStatuses() from reportUtils.js instead.
export function mergeWPStatuses(statusSnapshots) {
  const merged = makeEmptyWPStatuses();
  for (const snapshot of statusSnapshots) {
    if (!snapshot) continue;
    for (const wp of WORK_PACKAGES) {
      const pkgSnap = snapshot[wp.id] || {};
      for (const task of wp.tasks) {
        const snap = pkgSnap[task.name];
        const cur  = merged[wp.id][task.name];
        if (!snap) continue;
        const snapScore = WP_STATUS_SCORES[snap.status] ?? -1;
        const curScore  = WP_STATUS_SCORES[cur.status]  ?? -1;
        if (snapScore > curScore || snap.progress > cur.progress) {
          merged[wp.id][task.name] = { ...cur, ...snap };
        }
      }
    }
  }
  return merged;
}

// ─── Discrepancy helpers ──────────────────────────────────────────────────────

export function getWPStatusScore(status) {
  return WP_STATUS_SCORES[status] ?? 0;
}

export function compareWPTaskStatus(pmStatus, gcStatus) {
  if (!pmStatus || !gcStatus) return null;
  const pmScore = getWPStatusScore(pmStatus);
  const gcScore = getWPStatusScore(gcStatus);
  if (pmScore === gcScore) return 'match';
  if (pmScore > gcScore) return 'pm-higher';
  return 'gc-higher';
}
