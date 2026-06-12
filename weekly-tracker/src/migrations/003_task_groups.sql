-- Migration 002: task groups
-- Maps existing flat task names to the new two-level group structure.
-- Old task IDs remain valid as subtasks within their group.
-- No existing data is deleted or renamed.

-- ────────────────────────────────────────────────────────────────────────────
-- Table: task_groups
-- Stores group metadata per work package.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_groups (
  id         TEXT PRIMARY KEY,          -- e.g. 'mep.g.hvac'
  wp_id      TEXT NOT NULL,             -- parent WP id, e.g. 'mep'
  name       TEXT NOT NULL,             -- display name, e.g. 'HVAC installation'
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────────────────────
-- Table: task_group_members
-- Maps each task name to its group (within a WP).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_group_members (
  group_id  TEXT NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
  wp_id     TEXT NOT NULL,
  task_name TEXT NOT NULL,
  PRIMARY KEY (wp_id, task_name)
);

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: preconstruction
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('precon.g.setup',    'preconstruction', 'Site setup & hoarding',    1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('precon.g.utils',    'preconstruction', 'Temporary utilities',       2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('precon.g.drawings', 'preconstruction', 'Shop drawings approval',    3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('precon.g.proc',     'preconstruction', 'Material procurement',      4) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('precon.g.setup',    'preconstruction', 'Site setup & hoarding')    ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('precon.g.utils',    'preconstruction', 'Temporary utilities')      ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('precon.g.drawings', 'preconstruction', 'Shop drawings approval')   ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('precon.g.proc',     'preconstruction', 'Material procurement')     ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: demolition
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('demo.g.demolition', 'demolition', 'Demolition & waste removal', 1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('demo.g.surface',    'demolition', 'Surface preparation',        2) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('demo.g.demolition', 'demolition', 'Demolition works')        ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('demo.g.demolition', 'demolition', 'Waste removal & disposal') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('demo.g.surface',    'demolition', 'Surface preparation')      ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: construction
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('con.g.floor',      'construction', 'Floor preparation & screed',     1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('con.g.partitions', 'construction', 'Partitions & drywall',           2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('con.g.openings',   'construction', 'Openings & structural works',    3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('con.g.ceiling',    'construction', 'Ceiling structures',             4) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('con.g.wptiling',   'construction', 'Waterproofing, tiling & cladding', 5) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('con.g.floor',      'construction', 'Floor preparation & screed')  ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('con.g.partitions', 'construction', 'Partitions & drywall')        ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('con.g.openings',   'construction', 'Openings & structural works') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('con.g.ceiling',    'construction', 'Ceiling structures')          ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('con.g.wptiling',   'construction', 'Waterproofing')               ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('con.g.wptiling',   'construction', 'Tiling & cladding')           ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: mep (renamed: MEP Rough-in → MEP Installation)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('mep.g.hvac',     'mep', 'HVAC installation',            1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.elec',     'mep', 'Electrical installation',      2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.plumb',    'mep', 'Plumbing installation',        3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.fire',     'mep', 'Fire protection systems',      4) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.security', 'mep', 'Security & access systems',    5) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.it',       'mep', 'IT, network & low current',    6) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.bms',      'mep', 'BMS & emergency systems',      7) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('mep.g.earthing', 'mep', 'Earthing & lightning protection', 8) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('mep.g.hvac',     'mep', 'HVAC ducts')                       ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.hvac',     'mep', 'HVAC pipes & equipment')           ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.elec',     'mep', 'Electrical conduits & cabling')    ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.elec',     'mep', 'Electrical panels & distribution') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.plumb',    'mep', 'Plumbing rough-in')                ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.fire',     'mep', 'Fire suppression pipes')           ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.fire',     'mep', 'Fire alarm cabling')               ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.security', 'mep', 'Access control rough-in')          ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.security', 'mep', 'CCTV & security rough-in')         ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.it',       'mep', 'IT & network infrastructure')      ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.it',       'mep', 'Low current systems')              ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.it',       'mep', 'Audio / PA rough-in')              ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.bms',      'mep', 'BMS integration')                  ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.bms',      'mep', 'Emergency lighting')               ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.bms',      'mep', 'UPS & power backup')               ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.earthing', 'mep', 'Earthing & bonding')               ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('mep.g.earthing', 'mep', 'Lightning protection')             ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: finishes
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('fin.g.paint',    'finishes', 'Painting & wall finishes',              1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.floors',   'finishes', 'Floor & ceiling finishes',              2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.joinery',  'finishes', 'Joinery & millwork',                    3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.glazing',  'finishes', 'Glazing, shopfront & doors',            4) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.signage',  'finishes', 'Signage & branding',                    5) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.lighting', 'finishes', 'Lighting fixtures, grilles & diffusers', 6) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.trims',    'finishes', 'Skirting, trims & speciality finishes', 7) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('fin.g.ext',      'finishes', 'External works & façade',               8) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('fin.g.paint',    'finishes', 'Painting & coatings')         ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.paint',    'finishes', 'Wall finishes')               ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.floors',   'finishes', 'Floor finishes')              ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.floors',   'finishes', 'Ceiling finishes')            ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.joinery',  'finishes', 'Joinery & millwork')          ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.glazing',  'finishes', 'Glazing & shopfront')         ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.glazing',  'finishes', 'Doors & hardware')            ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.signage',  'finishes', 'Signage & branding elements') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.lighting', 'finishes', 'Lighting fixtures')           ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.lighting', 'finishes', 'Grilles & diffusers')         ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.trims',    'finishes', 'Skirting & trims')            ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.trims',    'finishes', 'Speciality finishes')         ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('fin.g.ext',      'finishes', 'External works & façade')     ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: equipment
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('eq.g.retail',    'equipment', 'Retail equipment & displays',       1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('eq.g.furniture', 'equipment', 'Furniture & loose items',           2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('eq.g.pos',       'equipment', 'Cash area / POS setup',             3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('eq.g.storage',   'equipment', 'Storage, shelving & Back of House', 4) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('eq.g.retail',    'equipment', 'Retail equipment & displays') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('eq.g.furniture', 'equipment', 'Furniture & loose items')     ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('eq.g.pos',       'equipment', 'Cash area / POS setup')       ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('eq.g.storage',   'equipment', 'Storage & shelving systems')  ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('eq.g.storage',   'equipment', 'Back of House fit-out')       ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: commissioning
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('com.g.mep',       'commissioning', 'MEP testing',                  1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('com.g.fire',      'commissioning', 'Fire & life safety testing',   2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('com.g.security',  'commissioning', 'Security & IT systems testing', 3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('com.g.bms',       'commissioning', 'BMS commissioning',            4) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('com.g.integrated','commissioning', 'Integrated systems testing',   5) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('com.g.mep',       'commissioning', 'HVAC balancing & commissioning')    ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.mep',       'commissioning', 'Electrical testing & certification') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.fire',      'commissioning', 'Sprinkler testing & commissioning')  ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.fire',      'commissioning', 'Fire alarm testing')                ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.security',  'commissioning', 'Security & access control testing') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.security',  'commissioning', 'IT & POS integration testing')      ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.bms',       'commissioning', 'BMS commissioning')                 ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('com.g.integrated','commissioning', 'Integrated systems testing')        ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: handover
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO task_groups VALUES ('hov.g.snag',  'handover', 'Defects & snagging resolution', 1) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('hov.g.clean', 'handover', 'Final cleaning',                2) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('hov.g.train', 'handover', 'Staff training',                3) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('hov.g.docs',  'handover', 'Documentation handover',        4) ON CONFLICT DO NOTHING;
INSERT INTO task_groups VALUES ('hov.g.auth',  'handover', 'Authority approvals & permits', 5) ON CONFLICT DO NOTHING;

INSERT INTO task_group_members VALUES ('hov.g.snag',  'handover', 'Defects & snagging resolution') ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('hov.g.clean', 'handover', 'Final cleaning')                ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('hov.g.train', 'handover', 'Staff training')                ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('hov.g.docs',  'handover', 'O&M manuals')                   ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('hov.g.docs',  'handover', 'Certificates & warranties')     ON CONFLICT DO NOTHING;
INSERT INTO task_group_members VALUES ('hov.g.auth',  'handover', 'Authority approvals & permits') ON CONFLICT DO NOTHING;
