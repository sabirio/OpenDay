export const constructionRetailV1 = {
  id: 'construction-retail-v1',
  version: 'enterprise-v1',
  phases: [
    {
      id: 'demolition', label: 'Demolition', order: 1,
      progressWeight: 5, riskWeight: 2, openingImpact: 1, criticality: 2,
      discipline: 'Civil',
      workPackages: [
        { id: 'demo.strip_out',      openingBlocker: false, label: 'Strip Out & Clear',      durationPct: 0.40, isBlocker: false, defaultLagDays: 0  },
        { id: 'demo.structural',     openingBlocker: false, label: 'Structural Demolition',   durationPct: 0.40, isBlocker: false, defaultLagDays: 0  },
        { id: 'demo.mep_disconnect', openingBlocker: false, label: 'MEP Disconnection',       durationPct: 0.20, isBlocker: false, defaultLagDays: 0  },
      ],
    },
    {
      id: 'floor_prep', label: 'Floor Preparation', order: 2,
      progressWeight: 8, riskWeight: 6, openingImpact: 5, criticality: 3,
      discipline: 'Civil',
      workPackages: [
        { id: 'floor.screed', openingBlocker: false, label: 'Floor Screed / Levelling', durationPct: 1.00, isBlocker: true, defaultLagDays: 10 },
      ],
    },
    {
      id: 'rough_in', label: 'Installation Works', order: 3,
      progressWeight: 22, riskWeight: 25, openingImpact: 30, criticality: 5,
      discipline: 'Mechanical',
      workPackages: [
        { id: 'walls.marking',  openingBlocker: false, label: 'Wall Marking & Setting Out', durationPct: 0.10, isBlocker: false, defaultLagDays: 0 },
        { id: 'walls.framing',  openingBlocker: false, label: 'Wall Framing / Partitions',  durationPct: 0.30, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.electrical', openingBlocker: false, label: 'Electrical Rough-In',        durationPct: 0.20, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.hvac',       openingBlocker: false, label: 'HVAC Ductwork',              durationPct: 0.20, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.plumbing',   openingBlocker: false, label: 'Plumbing Rough-In',          durationPct: 0.10, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.fire',       openingBlocker: false, label: 'Fire Protection Rough-In',   durationPct: 0.10, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'floor_tiling', label: 'Floor Tiling', order: 3.5,
      progressWeight: 10, riskWeight: 8, openingImpact: 8, criticality: 3,
      discipline: 'Architectural',
      workPackages: [
        { id: 'floor.tiling', openingBlocker: false, label: 'Floor Tiling', durationPct: 1.00, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'testing', label: 'Systems Testing', order: 4,
      progressWeight: 5, riskWeight: 12, openingImpact: 10, criticality: 5,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'test.electrical', openingBlocker: 'critical', label: 'Electrical Testing',         durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 3, responsibleRole: 'GC' },
        { id: 'test.hvac',       openingBlocker: 'critical', label: 'HVAC Pressure Test',         durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 3, responsibleRole: 'GC' },
        { id: 'test.plumbing',   openingBlocker: 'soft',     label: 'Plumbing Pressure Test',     durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 2, responsibleRole: 'GC' },
        { id: 'test.fire',       openingBlocker: 'critical', label: 'Fire System Hydraulic Test', durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 5, responsibleRole: 'GC' },
      ],
    },
    {
      id: 'wall_closing', label: 'Wall Closing', order: 5,
      progressWeight: 10, riskWeight: 10, openingImpact: 10, criticality: 3,
      discipline: 'Architectural',
      workPackages: [
        { id: 'walls.closing', openingBlocker: false, label: 'Wall Board & Closing', durationPct: 1.00, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'finishes', label: 'Finishing Works', order: 6,
      progressWeight: 15, riskWeight: 15, openingImpact: 12, criticality: 4,
      discipline: 'Architectural',
      workPackages: [
        { id: 'finish.walls',        openingBlocker: false, label: 'Wall Finishes (plaster/paint/cladding)', durationPct: 0.35, isBlocker: false, defaultLagDays: 0 },
        { id: 'finish.ceiling',      openingBlocker: false, label: 'Ceiling Finishes',                        durationPct: 0.35, isBlocker: false, defaultLagDays: 0 },
        { id: 'finish.floor_finish', openingBlocker: false, label: 'Floor Finishing & Skirting',              durationPct: 0.30, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'end_devices', label: 'End Devices & Furniture', order: 7,
      progressWeight: 10, riskWeight: 8, openingImpact: 18, criticality: 3,
      discipline: 'Furniture',
      workPackages: [
        { id: 'devices.lighting',  openingBlocker: 'critical', label: 'Lighting Fixtures',    durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 4, responsibleRole: 'GC' },
        { id: 'devices.sensors',   openingBlocker: 'critical', label: 'Sensors & Detectors',  durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 3, responsibleRole: 'GC' },
        { id: 'devices.sockets',   openingBlocker: false,      label: 'Sockets & Switches',   durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'furniture.install', openingBlocker: 'critical', label: 'Furniture & Fixtures',  durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 5, responsibleRole: 'GC' },
      ],
    },
    {
      id: 'commissioning', label: 'Commissioning', order: 8,
      progressWeight: 5, riskWeight: 13, openingImpact: 20, criticality: 5,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'comm.full_test', openingBlocker: 'critical', label: 'Full Systems Commissioning', durationPct: 0.50, isBlocker: false, defaultLagDays: 0, typicalClearDays: 7, responsibleRole: 'GC' },
        { id: 'comm.snagging',  openingBlocker: 'critical', label: 'Snagging / Punch List',      durationPct: 0.50, isBlocker: false, defaultLagDays: 0, typicalClearDays: 5, responsibleRole: 'GC' },
      ],
    },
    {
      id: 'pre_opening', label: 'Pre-Opening', order: 9,
      progressWeight: 5, riskWeight: 6, openingImpact: 10, criticality: 4,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'preopening.training', openingBlocker: 'soft',     label: 'Staff Training',           durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 3, responsibleRole: 'PM' },
        { id: 'preopening.cleaning', openingBlocker: 'critical', label: 'Deep Cleaning',            durationPct: 0.25, isBlocker: false, defaultLagDays: 0, typicalClearDays: 2, responsibleRole: 'GC' },
        { id: 'preopening.docs',     openingBlocker: false,      label: 'As-Built Documentation',   durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'preopening.reports',  openingBlocker: false,      label: 'Completion Reports',       durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'handover', label: 'Handover', order: 10,
      progressWeight: 5, riskWeight: 10, openingImpact: 9, criticality: 5,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'handover.inspection', openingBlocker: 'critical', label: 'Final Inspection',      durationPct: 0.40, isBlocker: false, defaultLagDays: 0, typicalClearDays: 5, responsibleRole: 'Landlord' },
        { id: 'handover.transfer',   openingBlocker: 'critical', label: 'Acceptance & Transfer', durationPct: 0.40, isBlocker: false, defaultLagDays: 0, typicalClearDays: 3, responsibleRole: 'Landlord' },
        { id: 'handover.keys',       openingBlocker: 'critical', label: 'Keys & Possession',     durationPct: 0.20, isBlocker: false, defaultLagDays: 0, typicalClearDays: 1, responsibleRole: 'Landlord' },
      ],
    },
  ],
};
