// Central Work Packages configuration — single source of truth for all progress,
// Gantt, contractor reports, PM site visits, and risk scoring.

export const WORK_PACKAGES = [
  {
    id: 'preconstruction',
    name: 'Pre-construction',
    color: '#64748b',
    weight: 0.05,
    tasks: [
      { name: 'Site setup & hoarding', weight: 40 },
      { name: 'Temporary utilities', weight: 30 },
      { name: 'Shop drawings approval', weight: 20 },
      { name: 'Material procurement', weight: 10 },
    ],
  },
  {
    id: 'demolition',
    name: 'Demolition & Preparation',
    color: '#dc2626',
    weight: 0.05,
    tasks: [
      { name: 'Demolition works', weight: 60 },
      { name: 'Waste removal & disposal', weight: 25 },
      { name: 'Surface preparation', weight: 15 },
    ],
  },
  {
    id: 'construction',
    name: 'Construction',
    color: '#ea580c',
    weight: 0.20,
    tasks: [
      { name: 'Floor preparation & screed', weight: 15 },
      { name: 'Partitions & drywall', weight: 20 },
      { name: 'Openings & structural works', weight: 15 },
      { name: 'Ceiling structures', weight: 20 },
      { name: 'Waterproofing', weight: 10 },
      { name: 'Tiling & cladding', weight: 20 },
    ],
  },
  {
    id: 'mep',
    name: 'MEP Rough-in',
    color: '#0284c7',
    weight: 0.25,
    tasks: [
      { name: 'HVAC ducts', weight: 8 },
      { name: 'HVAC pipes & equipment', weight: 8 },
      { name: 'Electrical conduits & cabling', weight: 10 },
      { name: 'Electrical panels & distribution', weight: 8 },
      { name: 'Plumbing rough-in', weight: 6 },
      { name: 'Fire suppression pipes', weight: 8 },
      { name: 'Fire alarm cabling', weight: 6 },
      { name: 'Low current systems', weight: 6 },
      { name: 'Access control rough-in', weight: 5 },
      { name: 'CCTV & security rough-in', weight: 5 },
      { name: 'IT & network infrastructure', weight: 7 },
      { name: 'Audio / PA rough-in', weight: 4 },
      { name: 'BMS integration', weight: 5 },
      { name: 'Emergency lighting', weight: 4 },
      { name: 'UPS & power backup', weight: 5 },
      { name: 'Lightning protection', weight: 3 },
      { name: 'Earthing & bonding', weight: 2 },
    ],
  },
  {
    id: 'finishes',
    name: 'Finishes & Final Installation',
    color: '#7c3aed',
    weight: 0.20,
    tasks: [
      { name: 'Painting & coatings', weight: 10 },
      { name: 'Floor finishes', weight: 12 },
      { name: 'Ceiling finishes', weight: 10 },
      { name: 'Wall finishes', weight: 10 },
      { name: 'Joinery & millwork', weight: 10 },
      { name: 'Glazing & shopfront', weight: 8 },
      { name: 'Doors & hardware', weight: 8 },
      { name: 'Signage & branding elements', weight: 6 },
      { name: 'Lighting fixtures', weight: 10 },
      { name: 'Grilles & diffusers', weight: 6 },
      { name: 'Skirting & trims', weight: 5 },
      { name: 'Speciality finishes', weight: 3 },
      { name: 'External works & façade', weight: 2 },
    ],
  },
  {
    id: 'equipment',
    name: 'Fixtures & Equipment',
    color: '#0d9488',
    weight: 0.10,
    tasks: [
      { name: 'Retail equipment & displays', weight: 25 },
      { name: 'Furniture & loose items', weight: 20 },
      { name: 'Cash area / POS setup', weight: 20 },
      { name: 'Storage & shelving systems', weight: 20 },
      { name: 'Back of House fit-out', weight: 15 },
    ],
  },
  {
    id: 'commissioning',
    name: 'Testing & Commissioning',
    color: '#b45309',
    weight: 0.10,
    tasks: [
      { name: 'HVAC balancing & commissioning', weight: 15 },
      { name: 'Electrical testing & certification', weight: 15 },
      { name: 'Sprinkler testing & commissioning', weight: 15 },
      { name: 'Fire alarm testing', weight: 12 },
      { name: 'Security & access control testing', weight: 10 },
      { name: 'IT & POS integration testing', weight: 10 },
      { name: 'BMS commissioning', weight: 8 },
      { name: 'Integrated systems testing', weight: 15 },
    ],
  },
  {
    id: 'handover',
    name: 'Snagging & Handover',
    color: '#15803d',
    weight: 0.05,
    tasks: [
      { name: 'Defects & snagging resolution', weight: 25 },
      { name: 'Final cleaning', weight: 15 },
      { name: 'Staff training', weight: 15 },
      { name: 'O&M manuals', weight: 15 },
      { name: 'Certificates & warranties', weight: 15 },
      { name: 'Authority approvals & permits', weight: 15 },
    ],
  },
];

// ─── Status scoring ───────────────────────────────────────────────────────────

export const WP_STATUS_OPTIONS = [
  'Not Started',
  'In Progress',
  'Delayed',
  'Completed',
  'Not Applicable',
];

export const WP_STATUS_SCORES = {
  'Not Started': 0,
  'In Progress': 0.5,
  Delayed: 0.3,
  Completed: 1,
  'Not Applicable': null, // excluded from calculations
};

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getPackageById(id) {
  return WORK_PACKAGES.find((wp) => wp.id === id) || null;
}

export function getAllTaskNames() {
  return WORK_PACKAGES.flatMap((wp) => wp.tasks.map((t) => t.name));
}

// ─── Empty status builders ────────────────────────────────────────────────────

/** Returns { [wpId]: { [taskName]: { status, progress, comment, photo, risk } } } */
export function makeEmptyWPStatuses() {
  const result = {};
  for (const wp of WORK_PACKAGES) {
    result[wp.id] = {};
    for (const task of wp.tasks) {
      result[wp.id][task.name] = {
        status: 'Not Started',
        progress: 0,
        comment: '',
        photo: null,
        risk: false,
      };
    }
  }
  return result;
}

/** Returns { [wpId]: { [taskName]: { observedStatus, progress, issueFound, riskLevel, comment, photo } } } */
export function makeEmptyPMWPStatuses() {
  const result = {};
  for (const wp of WORK_PACKAGES) {
    result[wp.id] = {};
    for (const task of wp.tasks) {
      result[wp.id][task.name] = {
        observedStatus: '',   // empty = not yet assessed by PM
        progress: 0,
        issueFound: false,
        riskLevel: 'None',
        comment: '',
        photo: null,
      };
    }
  }
  return result;
}

// ─── Progress computation ─────────────────────────────────────────────────────

/**
 * Compute a 0–100 progress score for a single work package.
 * Uses per-task weights. Progress field takes precedence over status if > 0.
 */
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
    if (score == null) continue; // undefined status or Not Applicable — skip

    const effectiveProgress =
      (entry.progress > 0) ? entry.progress / 100 : score;

    totalWeight += task.weight;
    weightedScore += task.weight * effectiveProgress;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedScore / totalWeight) * 100);
}

/**
 * Compute overall project progress from workPackageStatuses.
 * Weighted by each package's `weight` field.
 */
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

/**
 * Merge multiple WP status snapshots (from multiple reports) keeping best progress per task.
 * Returns merged workPackageStatuses object.
 */
export function mergeWPStatuses(statusSnapshots) {
  const merged = makeEmptyWPStatuses();

  for (const snapshot of statusSnapshots) {
    if (!snapshot) continue;
    for (const wp of WORK_PACKAGES) {
      const pkgSnap = snapshot[wp.id] || {};
      for (const task of wp.tasks) {
        const snap = pkgSnap[task.name];
        const cur = merged[wp.id][task.name];
        if (!snap) continue;

        const snapScore = WP_STATUS_SCORES[snap.status] ?? -1;
        const curScore = WP_STATUS_SCORES[cur.status] ?? -1;

        if (snapScore > curScore || snap.progress > cur.progress) {
          merged[wp.id][task.name] = { ...cur, ...snap };
        }
      }
    }
  }

  return merged;
}

// ─── Gantt generator ──────────────────────────────────────────────────────────

/**
 * Generate a flat list of Gantt tasks from WORK_PACKAGES with default linear FS dependencies.
 * Returns array compatible with scheduleTemplates task shape.
 */
export function generateGanttTasksFromWP(projectDurationDays = 180) {
  const tasks = [];
  const packageDuration = Math.floor(projectDurationDays / WORK_PACKAGES.length);

  let offset = 0;
  let prevPackageLastId = null;

  for (const wp of WORK_PACKAGES) {
    const taskDuration = Math.max(
      3,
      Math.floor((packageDuration * wp.weight * WORK_PACKAGES.length) / 1)
    );
    const perTask = Math.max(2, Math.floor(taskDuration / wp.tasks.length));
    let prevTaskId = null;

    for (let i = 0; i < wp.tasks.length; i++) {
      const task = wp.tasks[i];
      const taskId = `${wp.id}_${i}`;

      const deps = [];
      if (i === 0 && prevPackageLastId) {
        deps.push({ id: prevPackageLastId, type: 'FS', lag: 0 });
      } else if (i > 0 && prevTaskId) {
        deps.push({ id: prevTaskId, type: 'FS', lag: 0 });
      }

      tasks.push({
        id: taskId,
        name: task.name,
        duration: perTask,
        dependencies: deps,
        reportPhase: wp.id,
        reportKey: task.name,
        isMilestone: false,
        scheduleMode: 'AUTO',
        _wpId: wp.id,
        _wpColor: wp.color,
      });

      prevTaskId = taskId;
    }

    prevPackageLastId = `${wp.id}_${wp.tasks.length - 1}`;
    offset += taskDuration;
  }

  // Add opening milestone at end
  tasks.push({
    id: 'opening_milestone',
    name: 'Store Opening',
    duration: 0,
    dependencies: [{ id: prevPackageLastId, type: 'FS', lag: 0 }],
    isMilestone: true,
    scheduleMode: 'AUTO',
    _wpId: null,
    _wpColor: '#2563eb',
  });

  return tasks;
}

// ─── Discrepancy helpers (PM vs GC) ──────────────────────────────────────────

export function getWPStatusScore(status) {
  return WP_STATUS_SCORES[status] ?? 0;
}

/**
 * Compare PM observed status vs GC reported status for a single task.
 * Returns 'match' | 'pm-higher' | 'gc-higher' | 'discrepancy'
 */
export function compareWPTaskStatus(pmStatus, gcStatus) {
  if (!pmStatus || !gcStatus) return null;
  const pmScore = getWPStatusScore(pmStatus);
  const gcScore = getWPStatusScore(gcStatus);
  if (pmScore === gcScore) return 'match';
  if (pmScore > gcScore) return 'pm-higher';
  return 'gc-higher';
}
