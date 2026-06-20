export const constructionRetailV1 = {
  id: 'construction-retail-v1',
  version: 'enterprise-v1',
  phases: [
    {
      id: 'demolition', label: 'Demolition', order: 1,
      progressWeight: 5, riskWeight: 2, openingImpact: 1, criticality: 2,
      discipline: 'Civil',
      workPackages: [
        { id: 'demo.strip_out',      label: 'Strip Out & Clear',      durationPct: 0.40, isBlocker: false, defaultLagDays: 0  },
        { id: 'demo.structural',     label: 'Structural Demolition',   durationPct: 0.40, isBlocker: false, defaultLagDays: 0  },
        { id: 'demo.mep_disconnect', label: 'MEP Disconnection',       durationPct: 0.20, isBlocker: false, defaultLagDays: 0  },
      ],
    },
    {
      id: 'floor_prep', label: 'Floor Preparation', order: 2,
      progressWeight: 8, riskWeight: 6, openingImpact: 5, criticality: 3,
      discipline: 'Civil',
      workPackages: [
        { id: 'floor.screed', label: 'Floor Screed / Levelling', durationPct: 1.00, isBlocker: true, defaultLagDays: 10 },
      ],
    },
    {
      id: 'rough_in', label: 'Installation Works', order: 3,
      progressWeight: 22, riskWeight: 25, openingImpact: 30, criticality: 5,
      discipline: 'Mechanical',
      workPackages: [
        { id: 'walls.marking',  label: 'Wall Marking & Setting Out', durationPct: 0.10, isBlocker: false, defaultLagDays: 0 },
        { id: 'walls.framing',  label: 'Wall Framing / Partitions',  durationPct: 0.30, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.electrical', label: 'Electrical Rough-In',        durationPct: 0.20, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.hvac',       label: 'HVAC Ductwork',              durationPct: 0.20, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.plumbing',   label: 'Plumbing Rough-In',          durationPct: 0.10, isBlocker: false, defaultLagDays: 0 },
        { id: 'mep.fire',       label: 'Fire Protection Rough-In',   durationPct: 0.10, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'floor_tiling', label: 'Floor Tiling', order: 3.5,
      progressWeight: 10, riskWeight: 8, openingImpact: 8, criticality: 3,
      discipline: 'Architectural',
      workPackages: [
        { id: 'floor.tiling', label: 'Floor Tiling', durationPct: 1.00, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'testing', label: 'Systems Testing', order: 4,
      progressWeight: 5, riskWeight: 12, openingImpact: 10, criticality: 5,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'test.electrical', label: 'Electrical Testing',         durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'test.hvac',       label: 'HVAC Pressure Test',         durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'test.plumbing',   label: 'Plumbing Pressure Test',     durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'test.fire',       label: 'Fire System Hydraulic Test', durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'wall_closing', label: 'Wall Closing', order: 5,
      progressWeight: 10, riskWeight: 10, openingImpact: 10, criticality: 3,
      discipline: 'Architectural',
      workPackages: [
        { id: 'walls.closing', label: 'Wall Board & Closing', durationPct: 1.00, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'finishes', label: 'Finishing Works', order: 6,
      progressWeight: 15, riskWeight: 15, openingImpact: 12, criticality: 4,
      discipline: 'Architectural',
      workPackages: [
        { id: 'finish.walls',        label: 'Wall Finishes (plaster/paint/cladding)', durationPct: 0.35, isBlocker: false, defaultLagDays: 0 },
        { id: 'finish.ceiling',      label: 'Ceiling Finishes',                        durationPct: 0.35, isBlocker: false, defaultLagDays: 0 },
        { id: 'finish.floor_finish', label: 'Floor Finishing & Skirting',              durationPct: 0.30, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'end_devices', label: 'End Devices & Furniture', order: 7,
      progressWeight: 10, riskWeight: 8, openingImpact: 18, criticality: 3,
      discipline: 'Furniture',
      workPackages: [
        { id: 'devices.lighting',  label: 'Lighting Fixtures',    durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'devices.sensors',   label: 'Sensors & Detectors',  durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'devices.sockets',   label: 'Sockets & Switches',   durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'furniture.install', label: 'Furniture & Fixtures',  durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'commissioning', label: 'Commissioning', order: 8,
      progressWeight: 5, riskWeight: 13, openingImpact: 20, criticality: 5,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'comm.full_test', label: 'Full Systems Commissioning', durationPct: 0.50, isBlocker: false, defaultLagDays: 0 },
        { id: 'comm.snagging',  label: 'Snagging / Punch List',      durationPct: 0.50, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'pre_opening', label: 'Pre-Opening', order: 9,
      progressWeight: 5, riskWeight: 6, openingImpact: 10, criticality: 4,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'preopening.training', label: 'Staff Training',           durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'preopening.cleaning', label: 'Deep Cleaning',            durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'preopening.docs',     label: 'As-Built Documentation',   durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
        { id: 'preopening.reports',  label: 'Completion Reports',       durationPct: 0.25, isBlocker: false, defaultLagDays: 0 },
      ],
    },
    {
      id: 'handover', label: 'Handover', order: 10,
      progressWeight: 5, riskWeight: 10, openingImpact: 9, criticality: 5,
      discipline: 'Commissioning',
      workPackages: [
        { id: 'handover.inspection', label: 'Final Inspection',      durationPct: 0.40, isBlocker: false, defaultLagDays: 0 },
        { id: 'handover.transfer',   label: 'Acceptance & Transfer', durationPct: 0.40, isBlocker: false, defaultLagDays: 0 },
        { id: 'handover.keys',       label: 'Keys & Possession',     durationPct: 0.20, isBlocker: false, defaultLagDays: 0 },
      ],
    },
  ],
};
