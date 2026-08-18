-- 060_work_ontology_foundation.sql
-- Versioned Master Work Ontology persistence foundation.
-- Generated deterministically by:
--   node scripts/generateWorkOntologyMigration.mjs

BEGIN;

-- The local roadmap database may already contain the schema-v1 ontology.
-- Release the immutability guards only inside this transaction so the
-- canonical schema-v2 seed can upgrade that local foundation in place.
DO $$
BEGIN
  IF to_regclass('public.work_ontology_versions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_version_immutable ON public.work_ontology_versions';
  END IF;
  IF to_regclass('public.work_ontology_disciplines') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_disciplines_immutable ON public.work_ontology_disciplines';
  END IF;
  IF to_regclass('public.work_ontology_departments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_departments_immutable ON public.work_ontology_departments';
  END IF;
  IF to_regclass('public.work_ontology_work_groups') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_work_groups_immutable ON public.work_ontology_work_groups';
  END IF;
  IF to_regclass('public.work_ontology_boq_item_definitions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_boq_definitions_immutable ON public.work_ontology_boq_item_definitions';
  END IF;
  IF to_regclass('public.work_ontology_execution_classifications') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS work_ontology_execution_classifications_immutable ON public.work_ontology_execution_classifications';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.work_ontology_versions (
  id uuid PRIMARY KEY,
  company_id text,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  version integer NOT NULL CHECK (version > 0),
  label text NOT NULL CHECK (btrim(label) <> ''),
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retired_at timestamptz,
  CONSTRAINT work_ontology_versions_active_status_check
    CHECK (NOT is_active OR status = 'PUBLISHED')
);

CREATE UNIQUE INDEX IF NOT EXISTS work_ontology_versions_owner_version_uniq
  ON public.work_ontology_versions (company_id, version) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS work_ontology_versions_one_active_per_owner
  ON public.work_ontology_versions (company_id) NULLS NOT DISTINCT
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.work_ontology_departments (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  display_order integer NOT NULL,
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code)
);

CREATE TABLE IF NOT EXISTS public.work_ontology_disciplines (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  department_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  display_order integer NOT NULL,
  scope_selectable boolean NOT NULL DEFAULT true,
  budget_selectable boolean NOT NULL DEFAULT true,
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code),
  FOREIGN KEY (ontology_version_id, department_id)
    REFERENCES public.work_ontology_departments(ontology_version_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE public.work_ontology_disciplines
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS budget_selectable boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.work_ontology_work_groups (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  display_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code),
  FOREIGN KEY (ontology_version_id, discipline_id)
    REFERENCES public.work_ontology_disciplines(ontology_version_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE public.work_ontology_work_groups
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.work_ontology_boq_item_definitions (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  code text NOT NULL CHECK (btrim(code) <> ''),
  label text NOT NULL CHECK (btrim(label) <> ''),
  default_unit text NOT NULL CHECK (btrim(default_unit) <> ''),
  PRIMARY KEY (ontology_version_id, id),
  UNIQUE (ontology_version_id, code),
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.work_ontology_execution_classifications (
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE CASCADE,
  execution_work_package_id text NOT NULL CHECK (btrim(execution_work_package_id) <> ''),
  kind text NOT NULL CHECK (kind IN ('MAPPED', 'DEFERRED', 'LIFECYCLE')),
  work_group_id uuid,
  reason_code text,
  PRIMARY KEY (ontology_version_id, execution_work_package_id),
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT work_ontology_execution_classification_shape_check CHECK (
    (kind = 'MAPPED' AND work_group_id IS NOT NULL AND reason_code IS NULL)
    OR
    (kind IN ('DEFERRED', 'LIFECYCLE') AND work_group_id IS NULL AND btrim(reason_code) <> '')
  )
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS work_ontology_version_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_work_ontology_version_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_work_ontology_version_id_fkey
      FOREIGN KEY (work_ontology_version_id)
      REFERENCES public.work_ontology_versions(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

CREATE TEMP TABLE work_ontology_seed_payload ON COMMIT DROP AS
SELECT $work_ontology$
{
  "version": {
    "id": "de782297-1166-41da-8f21-e3deef6609a7",
    "company_id": null,
    "schema_version": 2,
    "version": 1,
    "label": "Retail Fit-Out Work Ontology v1 — approved three-level classification",
    "status": "PUBLISHED",
    "is_active": true
  },
  "departments": [
    {
      "id": "d1000000-0000-4000-8000-000000000001",
      "code": "D100",
      "label": "Construction",
      "display_order": 10
    },
    {
      "id": "d2000000-0000-4000-8000-000000000002",
      "code": "D200",
      "label": "Security",
      "display_order": 20
    },
    {
      "id": "d3000000-0000-4000-8000-000000000003",
      "code": "D300",
      "label": "IT & Low Current",
      "display_order": 30
    },
    {
      "id": "d4000000-0000-4000-8000-000000000004",
      "code": "D400",
      "label": "Furniture & Joinery",
      "display_order": 40
    },
    {
      "id": "d5000000-0000-4000-8000-000000000005",
      "code": "D500",
      "label": "Signage & Graphics",
      "display_order": 50
    },
    {
      "id": "d6000000-0000-4000-8000-000000000006",
      "code": "D600",
      "label": "Project Administration & Control",
      "display_order": 60
    }
  ],
  "disciplines": [
    {
      "id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "department_id": "d1000000-0000-4000-8000-000000000001",
      "code": "C100",
      "label": "General Construction",
      "display_order": 10,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "department_id": "d1000000-0000-4000-8000-000000000001",
      "code": "E100",
      "label": "Electrical",
      "display_order": 20,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "department_id": "d1000000-0000-4000-8000-000000000001",
      "code": "H100",
      "label": "HVAC",
      "display_order": 30,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "department_id": "d1000000-0000-4000-8000-000000000001",
      "code": "P100",
      "label": "Plumbing & Drainage",
      "display_order": 40,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "department_id": "d1000000-0000-4000-8000-000000000001",
      "code": "F100",
      "label": "Fire & Life Safety",
      "display_order": 50,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "31000000-0000-4000-8000-000000000001",
      "department_id": "d1000000-0000-4000-8000-000000000001",
      "code": "V100",
      "label": "Vertical Transportation",
      "display_order": 60,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "department_id": "d2000000-0000-4000-8000-000000000002",
      "code": "S100",
      "label": "Security",
      "display_order": 70,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "department_id": "d3000000-0000-4000-8000-000000000003",
      "code": "I100",
      "label": "IT, Voice & Data",
      "display_order": 80,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "a1000000-0000-4000-8000-000000000001",
      "department_id": "d3000000-0000-4000-8000-000000000003",
      "code": "A100",
      "label": "Audiovisual",
      "display_order": 90,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "department_id": "d4000000-0000-4000-8000-000000000004",
      "code": "J100",
      "label": "Furniture & Joinery",
      "display_order": 100,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "department_id": "d5000000-0000-4000-8000-000000000005",
      "code": "G100",
      "label": "Signage & Graphics",
      "display_order": 110,
      "scope_selectable": true,
      "budget_selectable": true
    },
    {
      "id": "91000000-0000-4000-8000-000000000001",
      "department_id": "d6000000-0000-4000-8000-000000000006",
      "code": "M100",
      "label": "Project Administration & Control",
      "display_order": 120,
      "scope_selectable": false,
      "budget_selectable": true
    }
  ],
  "work_groups": [
    {
      "id": "c1000000-0000-4000-8000-000000000001",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.01",
      "label": "Preliminaries & Site Setup",
      "display_order": 10
    },
    {
      "id": "c1000000-0000-4000-8000-000000000012",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.02",
      "label": "Temporary Hoarding & Site Protection",
      "display_order": 20
    },
    {
      "id": "c1000000-0000-4000-8000-000000000013",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.03",
      "label": "Temporary Utilities & Facilities",
      "display_order": 30
    },
    {
      "id": "c1000000-0000-4000-8000-000000000014",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.04",
      "label": "Access, Scaffolding & Temporary Equipment",
      "display_order": 40
    },
    {
      "id": "c1000000-0000-4000-8000-000000000015",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.05",
      "label": "Material Handling & Internal Logistics",
      "display_order": 50
    },
    {
      "id": "c1000000-0000-4000-8000-000000000002",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.06",
      "label": "Demolition & Dismantling",
      "display_order": 60
    },
    {
      "id": "c1000000-0000-4000-8000-00000000000a",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.07",
      "label": "Construction Cleaning & Waste Removal",
      "display_order": 70
    },
    {
      "id": "c1000000-0000-4000-8000-000000000003",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.08",
      "label": "Structural Steel & Supporting Frames",
      "display_order": 80
    },
    {
      "id": "c1000000-0000-4000-8000-000000000016",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.09",
      "label": "Stairs, Platforms & Structural Openings",
      "display_order": 90
    },
    {
      "id": "c1000000-0000-4000-8000-000000000004",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.10",
      "label": "Waterproofing",
      "display_order": 100
    },
    {
      "id": "c1000000-0000-4000-8000-000000000017",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.11",
      "label": "Thermal & Acoustic Insulation",
      "display_order": 110
    },
    {
      "id": "c1000000-0000-4000-8000-000000000005",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.12",
      "label": "Gypsumboard Partitions",
      "display_order": 120
    },
    {
      "id": "c1000000-0000-4000-8000-000000000018",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.13",
      "label": "Masonry & Blockwork Partitions",
      "display_order": 130
    },
    {
      "id": "c1000000-0000-4000-8000-000000000019",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.14",
      "label": "Wall Reinforcement & Auxiliary Supports",
      "display_order": 140
    },
    {
      "id": "c1000000-0000-4000-8000-000000000020",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.15",
      "label": "Screeds, Levelling & Subfloor Preparation",
      "display_order": 150
    },
    {
      "id": "c1000000-0000-4000-8000-000000000008",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.16",
      "label": "Floor Finishes & Skirting",
      "display_order": 160
    },
    {
      "id": "c1000000-0000-4000-8000-000000000006",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.17",
      "label": "Ceiling Systems & Access Panels",
      "display_order": 170
    },
    {
      "id": "c1000000-0000-4000-8000-000000000007",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.18",
      "label": "Wall Cladding & Coverings",
      "display_order": 180
    },
    {
      "id": "c1000000-0000-4000-8000-000000000021",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.19",
      "label": "Painting & Decorative Finishes",
      "display_order": 190
    },
    {
      "id": "c1000000-0000-4000-8000-000000000022",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.20",
      "label": "Protective & Fire-Retardant Coatings",
      "display_order": 200
    },
    {
      "id": "c1000000-0000-4000-8000-000000000009",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.21",
      "label": "Glassworks",
      "display_order": 210
    },
    {
      "id": "c1000000-0000-4000-8000-000000000023",
      "discipline_id": "8086e28b-17ab-45be-b464-9514c6b90747",
      "code": "C100.22",
      "label": "Mirrors",
      "display_order": 220
    },
    {
      "id": "cdd14a6b-d934-4be0-ac32-1654246776d9",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.01",
      "label": "Incoming Electrical Supply & Network Connection",
      "display_order": 10
    },
    {
      "id": "b624b36a-26a6-4646-8319-58619e39e84b",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.02",
      "label": "Main Distribution Boards",
      "display_order": 20
    },
    {
      "id": "e1000000-0000-4000-8000-000000000003",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.03",
      "label": "Secondary Distribution Boards",
      "display_order": 30
    },
    {
      "id": "02a5d382-8471-4765-a663-1976d4ef416e",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.04",
      "label": "Uninterruptible Power Supply (UPS)",
      "display_order": 40
    },
    {
      "id": "b64ae329-9616-4e83-adb1-6cd1a6d08d2e",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.05",
      "label": "Power Distribution Cabling",
      "display_order": 50
    },
    {
      "id": "e1000000-0000-4000-8000-000000000006",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.06",
      "label": "Lighting Distribution Cabling",
      "display_order": 60
    },
    {
      "id": "2854d48a-477e-4407-b71c-5cea81aeb332",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.07",
      "label": "Cable Trays, Trunking & Surface Containment",
      "display_order": 70
    },
    {
      "id": "e1000000-0000-4000-8000-000000000008",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.08",
      "label": "Conduits & Concealed Containment",
      "display_order": 80
    },
    {
      "id": "53cb0b86-477b-4c98-9af2-13cb5e3afb26",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.09",
      "label": "Earthing & Bonding",
      "display_order": 90
    },
    {
      "id": "29bd2eb6-e70f-4724-9cd3-de6716d9cc05",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.10",
      "label": "General Lighting",
      "display_order": 100
    },
    {
      "id": "e1000000-0000-4000-8000-00000000000b",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.11",
      "label": "Feature, Display & Track Lighting",
      "display_order": 110
    },
    {
      "id": "8d9bc17d-28b1-4ec3-aa19-55e73cc4a648",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.12",
      "label": "Emergency & Exit Lighting",
      "display_order": 120
    },
    {
      "id": "e4946f33-9c11-41cf-b83e-5920112ac039",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.13",
      "label": "Switches & Lighting Controls",
      "display_order": 130
    },
    {
      "id": "52049988-239a-4b00-a3ea-482acf44a8bb",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.14",
      "label": "Sockets & Power Outlets",
      "display_order": 140
    },
    {
      "id": "df3c2db3-f15f-4b7d-aeeb-cb4cd3fe011d",
      "discipline_id": "76bee53d-a3b1-4646-b7b9-aaf0d2498e67",
      "code": "E100.15",
      "label": "Electrical Testing & Commissioning",
      "display_order": 150
    },
    {
      "id": "c2000000-0000-4000-8000-000000000002",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.01",
      "label": "Air Handling Units",
      "display_order": 10
    },
    {
      "id": "11000000-0000-4000-8000-000000000011",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.02",
      "label": "Fan Coil Units",
      "display_order": 20
    },
    {
      "id": "11000000-0000-4000-8000-000000000012",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.03",
      "label": "Split & Multi-Split Systems",
      "display_order": 30
    },
    {
      "id": "c2000000-0000-4000-8000-000000000003",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.04",
      "label": "Pumps & Hydronic Equipment",
      "display_order": 40
    },
    {
      "id": "c2000000-0000-4000-8000-000000000001",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.05",
      "label": "Equipment Supports & Anti-Vibration Mounts",
      "display_order": 50
    },
    {
      "id": "c2000000-0000-4000-8000-000000000004",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.06",
      "label": "Refrigerant & Hydraulic Pipework",
      "display_order": 60
    },
    {
      "id": "c2000000-0000-4000-8000-000000000005",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.07",
      "label": "Condensate Drainage",
      "display_order": 70
    },
    {
      "id": "11000000-0000-4000-8000-000000000013",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.08",
      "label": "HVAC Valves & Accessories",
      "display_order": 80
    },
    {
      "id": "c2000000-0000-4000-8000-000000000006",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.09",
      "label": "Sheet-Metal Ductwork",
      "display_order": 90
    },
    {
      "id": "11000000-0000-4000-8000-000000000014",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.10",
      "label": "Flexible Ductwork",
      "display_order": 100
    },
    {
      "id": "c2000000-0000-4000-8000-000000000008",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.11",
      "label": "Ventilation & Extract Fans",
      "display_order": 110
    },
    {
      "id": "11000000-0000-4000-8000-000000000015",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.12",
      "label": "Smoke Extract Systems",
      "display_order": 120
    },
    {
      "id": "11000000-0000-4000-8000-000000000016",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.13",
      "label": "Volume-Control & Fire/Smoke Dampers",
      "display_order": 130
    },
    {
      "id": "c2000000-0000-4000-8000-000000000007",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.14",
      "label": "Diffusers, Grilles & Louvres",
      "display_order": 140
    },
    {
      "id": "11000000-0000-4000-8000-000000000017",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.15",
      "label": "Air Curtains",
      "display_order": 150
    },
    {
      "id": "c2000000-0000-4000-8000-000000000009",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.16",
      "label": "HVAC Controls & Electrical Panels",
      "display_order": 160
    },
    {
      "id": "c2000000-0000-4000-8000-00000000000a",
      "discipline_id": "51fb93ad-e40a-4ad5-b71e-9e5a7539a845",
      "code": "H100.17",
      "label": "HVAC Testing, Balancing & Commissioning",
      "display_order": 170
    },
    {
      "id": "c3000000-0000-4000-8000-000000000001",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.01",
      "label": "Incoming Water Supply & Metering",
      "display_order": 10
    },
    {
      "id": "21000000-0000-4000-8000-000000000009",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.02",
      "label": "Cold-Water Distribution",
      "display_order": 20
    },
    {
      "id": "21000000-0000-4000-8000-000000000010",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.03",
      "label": "Hot-Water Distribution",
      "display_order": 30
    },
    {
      "id": "c3000000-0000-4000-8000-000000000002",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.04",
      "label": "Soil, Waste & Drainage Pipework",
      "display_order": 40
    },
    {
      "id": "21000000-0000-4000-8000-000000000011",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.05",
      "label": "Valves, Fittings & Accessories",
      "display_order": 50
    },
    {
      "id": "21000000-0000-4000-8000-000000000012",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.06",
      "label": "Water Heaters",
      "display_order": 60
    },
    {
      "id": "c3000000-0000-4000-8000-000000000003",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.07",
      "label": "Toilets & Sanitary Fixtures",
      "display_order": 70
    },
    {
      "id": "c3000000-0000-4000-8000-000000000005",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.08",
      "label": "Sinks, Basins & Taps",
      "display_order": 80
    },
    {
      "id": "c3000000-0000-4000-8000-000000000008",
      "discipline_id": "a0271bb8-74e5-4d46-b479-62721322a865",
      "code": "P100.09",
      "label": "Plumbing Testing & Commissioning",
      "display_order": 90
    },
    {
      "id": "c4000000-0000-4000-8000-000000000001",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.01",
      "label": "Fire-Water Connection & Main Pipework",
      "display_order": 10
    },
    {
      "id": "f1000000-0000-4000-8000-000000000010",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.02",
      "label": "Sprinkler Pipework",
      "display_order": 20
    },
    {
      "id": "f1000000-0000-4000-8000-000000000011",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.03",
      "label": "Sprinkler Heads",
      "display_order": 30
    },
    {
      "id": "c4000000-0000-4000-8000-000000000005",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.04",
      "label": "Fire Hose Reels",
      "display_order": 40
    },
    {
      "id": "c4000000-0000-4000-8000-000000000006",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.05",
      "label": "Portable Fire Extinguishers",
      "display_order": 50
    },
    {
      "id": "c4000000-0000-4000-8000-000000000002",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.06",
      "label": "Fire Alarm Control Panels & Modules",
      "display_order": 60
    },
    {
      "id": "f1000000-0000-4000-8000-000000000012",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.07",
      "label": "Manual Call Points",
      "display_order": 70
    },
    {
      "id": "f1000000-0000-4000-8000-000000000013",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.08",
      "label": "Smoke & Fire Detectors",
      "display_order": 80
    },
    {
      "id": "f1000000-0000-4000-8000-000000000014",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.09",
      "label": "Sounders, Sirens & Visual Alarms",
      "display_order": 90
    },
    {
      "id": "f1000000-0000-4000-8000-000000000015",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.10",
      "label": "Fire Alarm Cabling & Containment",
      "display_order": 100
    },
    {
      "id": "c4000000-0000-4000-8000-000000000008",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.11",
      "label": "Fire Pumps & Water Storage",
      "display_order": 110
    },
    {
      "id": "c4000000-0000-4000-8000-000000000009",
      "discipline_id": "335e4344-182d-4a14-9354-27fa49083b7f",
      "code": "F100.12",
      "label": "Fire-System Testing & Commissioning",
      "display_order": 120
    },
    {
      "id": "31000000-0000-4000-8000-000000000001",
      "discipline_id": "31000000-0000-4000-8000-000000000001",
      "code": "V100.01",
      "label": "Elevators",
      "display_order": 10
    },
    {
      "id": "31000000-0000-4000-8000-000000000002",
      "discipline_id": "31000000-0000-4000-8000-000000000001",
      "code": "V100.02",
      "label": "Escalators",
      "display_order": 20
    },
    {
      "id": "31000000-0000-4000-8000-000000000003",
      "discipline_id": "31000000-0000-4000-8000-000000000001",
      "code": "V100.03",
      "label": "Lift & Escalator Control Panels",
      "display_order": 30
    },
    {
      "id": "31000000-0000-4000-8000-000000000004",
      "discipline_id": "31000000-0000-4000-8000-000000000001",
      "code": "V100.04",
      "label": "Sensors, Detectors & Safety Devices",
      "display_order": 40
    },
    {
      "id": "31000000-0000-4000-8000-000000000005",
      "discipline_id": "31000000-0000-4000-8000-000000000001",
      "code": "V100.05",
      "label": "Power, Cabling & Interfaces",
      "display_order": 50
    },
    {
      "id": "31000000-0000-4000-8000-000000000006",
      "discipline_id": "31000000-0000-4000-8000-000000000001",
      "code": "V100.06",
      "label": "Programming, Testing & Commissioning",
      "display_order": 60
    },
    {
      "id": "c5000000-0000-4000-8000-000000000001",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.01",
      "label": "CCTV / Cameras",
      "display_order": 10
    },
    {
      "id": "51000000-0000-4000-8000-000000000007",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.02",
      "label": "CCTV Recording, Switching & Monitoring",
      "display_order": 20
    },
    {
      "id": "c5000000-0000-4000-8000-000000000002",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.03",
      "label": "Access Control",
      "display_order": 30
    },
    {
      "id": "c5000000-0000-4000-8000-000000000003",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.04",
      "label": "Intrusion Alarm",
      "display_order": 40
    },
    {
      "id": "c5000000-0000-4000-8000-000000000004",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.05",
      "label": "Intercom",
      "display_order": 50
    },
    {
      "id": "51000000-0000-4000-8000-000000000008",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.06",
      "label": "Electronic Article Surveillance (EAS)",
      "display_order": 60
    },
    {
      "id": "51000000-0000-4000-8000-000000000009",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.07",
      "label": "Security Detectors & Sensors",
      "display_order": 70
    },
    {
      "id": "51000000-0000-4000-8000-000000000010",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.08",
      "label": "Security Control Panels & Keypads",
      "display_order": 80
    },
    {
      "id": "c5000000-0000-4000-8000-000000000005",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.09",
      "label": "Physical Security, Locks & Exit Devices",
      "display_order": 90
    },
    {
      "id": "51000000-0000-4000-8000-000000000011",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.10",
      "label": "Security Cabling & Containment",
      "display_order": 100
    },
    {
      "id": "c5000000-0000-4000-8000-000000000006",
      "discipline_id": "20db5108-1f66-4ca3-8f55-4d26f33752c1",
      "code": "S100.11",
      "label": "Security Testing & Commissioning",
      "display_order": 110
    },
    {
      "id": "c6000000-0000-4000-8000-000000000001",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.01",
      "label": "Structured Cabling",
      "display_order": 10
    },
    {
      "id": "c6000000-0000-4000-8000-000000000002",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.02",
      "label": "Data Outlets & Patch Points",
      "display_order": 20
    },
    {
      "id": "c6000000-0000-4000-8000-000000000003",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.03",
      "label": "Network Racks & Cabinets",
      "display_order": 30
    },
    {
      "id": "c6000000-0000-4000-8000-00000000000a",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.04",
      "label": "Network Equipment & Accessories",
      "display_order": 40
    },
    {
      "id": "c6000000-0000-4000-8000-000000000004",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.05",
      "label": "Wi-Fi Infrastructure",
      "display_order": 50
    },
    {
      "id": "61000000-0000-4000-8000-000000000013",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.06",
      "label": "Telephony",
      "display_order": 60
    },
    {
      "id": "61000000-0000-4000-8000-000000000014",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.07",
      "label": "Low-Current Conduits & Containment",
      "display_order": 70
    },
    {
      "id": "61000000-0000-4000-8000-000000000015",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.08",
      "label": "IT Power & UPS Interfaces",
      "display_order": 80
    },
    {
      "id": "c6000000-0000-4000-8000-00000000000c",
      "discipline_id": "5b6838fc-9830-45b7-8b15-9d96c1524170",
      "code": "I100.09",
      "label": "Network Testing & Commissioning",
      "display_order": 90
    },
    {
      "id": "a1000000-0000-4000-8000-000000000001",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.01",
      "label": "Background-Music & Public-Address Speakers",
      "display_order": 10
    },
    {
      "id": "a1000000-0000-4000-8000-000000000002",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.02",
      "label": "Amplifiers, Mixers & Audio Sources",
      "display_order": 20
    },
    {
      "id": "a1000000-0000-4000-8000-000000000003",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.03",
      "label": "Microphones & Audio Accessories",
      "display_order": 30
    },
    {
      "id": "a1000000-0000-4000-8000-000000000004",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.04",
      "label": "LED Screens & Display Panels",
      "display_order": 40
    },
    {
      "id": "a1000000-0000-4000-8000-000000000005",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.05",
      "label": "TVs, Media Players & Display Controllers",
      "display_order": 50
    },
    {
      "id": "a1000000-0000-4000-8000-000000000006",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.06",
      "label": "Display Supports & Totem Structures",
      "display_order": 60
    },
    {
      "id": "a1000000-0000-4000-8000-000000000007",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.07",
      "label": "Audiovisual Cabling & Containment",
      "display_order": 70
    },
    {
      "id": "a1000000-0000-4000-8000-000000000008",
      "discipline_id": "a1000000-0000-4000-8000-000000000001",
      "code": "A100.08",
      "label": "Audiovisual Testing & Commissioning",
      "display_order": 80
    },
    {
      "id": "c7000000-0000-4000-8000-000000000004",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.01",
      "label": "Metal Doors & Frames",
      "display_order": 10
    },
    {
      "id": "71000000-0000-4000-8000-000000000008",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.02",
      "label": "Timber Doors & Frames",
      "display_order": 20
    },
    {
      "id": "71000000-0000-4000-8000-000000000009",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.03",
      "label": "Fire-Rated Doors & Joinery",
      "display_order": 30
    },
    {
      "id": "71000000-0000-4000-8000-000000000010",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.04",
      "label": "Sliding Doors, Shutters & Entrance Systems",
      "display_order": 40
    },
    {
      "id": "71000000-0000-4000-8000-000000000011",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.05",
      "label": "Handrails, Balustrades & Metalwork",
      "display_order": 50
    },
    {
      "id": "c7000000-0000-4000-8000-000000000001",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.06",
      "label": "Display-Window Joinery & Platforms",
      "display_order": 60
    },
    {
      "id": "c7000000-0000-4000-8000-000000000007",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.07",
      "label": "Back-of-House & Staff Furniture",
      "display_order": 70
    },
    {
      "id": "c7000000-0000-4000-8000-000000000006",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.08",
      "label": "Office, Kitchen & Locker Furniture",
      "display_order": 80
    },
    {
      "id": "c7000000-0000-4000-8000-000000000005",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.09",
      "label": "Storage Racking & Shelving",
      "display_order": 90
    },
    {
      "id": "71000000-0000-4000-8000-000000000012",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.10",
      "label": "Sales-Floor Perimeter Furniture",
      "display_order": 100
    },
    {
      "id": "71000000-0000-4000-8000-000000000013",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.11",
      "label": "Sales-Floor Freestanding Furniture",
      "display_order": 110
    },
    {
      "id": "c7000000-0000-4000-8000-000000000003",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.12",
      "label": "Cash Desks",
      "display_order": 120
    },
    {
      "id": "c7000000-0000-4000-8000-000000000002",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.13",
      "label": "Fitting-Room Furniture",
      "display_order": 130
    },
    {
      "id": "71000000-0000-4000-8000-000000000014",
      "discipline_id": "fe3f81ab-dffc-4018-9866-81d5d86afa0b",
      "code": "J100.14",
      "label": "Show-Window Furniture",
      "display_order": 140
    },
    {
      "id": "c8000000-0000-4000-8000-000000000002",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.01",
      "label": "Internal Signage",
      "display_order": 10
    },
    {
      "id": "81000000-0000-4000-8000-000000000007",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.02",
      "label": "Staff & Back-of-House Signage",
      "display_order": 20
    },
    {
      "id": "c8000000-0000-4000-8000-000000000003",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.03",
      "label": "Wayfinding & Statutory Signage",
      "display_order": 30
    },
    {
      "id": "81000000-0000-4000-8000-000000000008",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.04",
      "label": "Internal Façade Branding",
      "display_order": 40
    },
    {
      "id": "c8000000-0000-4000-8000-000000000001",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.05",
      "label": "External Façade Branding",
      "display_order": 50
    },
    {
      "id": "81000000-0000-4000-8000-000000000009",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.06",
      "label": "Illuminated Brand Signs",
      "display_order": 60
    },
    {
      "id": "81000000-0000-4000-8000-000000000010",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.07",
      "label": "Non-Illuminated Brand Signs",
      "display_order": 70
    },
    {
      "id": "c8000000-0000-4000-8000-000000000005",
      "discipline_id": "dbe3f3c4-2694-4554-9e8b-c27011e97101",
      "code": "G100.08",
      "label": "Applied Graphics & Vinyl",
      "display_order": 80
    },
    {
      "id": "91000000-0000-4000-8000-000000000001",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.01",
      "label": "Construction Permits & Approvals",
      "display_order": 10
    },
    {
      "id": "91000000-0000-4000-8000-000000000002",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.02",
      "label": "Other Statutory Permits",
      "display_order": 20
    },
    {
      "id": "91000000-0000-4000-8000-000000000003",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.03",
      "label": "Insurance & Bonds",
      "display_order": 30
    },
    {
      "id": "91000000-0000-4000-8000-000000000004",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.04",
      "label": "Guarantees & Warranties",
      "display_order": 40
    },
    {
      "id": "91000000-0000-4000-8000-000000000005",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.05",
      "label": "Project Mobilisation & Travel",
      "display_order": 50
    },
    {
      "id": "91000000-0000-4000-8000-000000000006",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.06",
      "label": "Site Supervision & Management",
      "display_order": 60
    },
    {
      "id": "91000000-0000-4000-8000-000000000007",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.07",
      "label": "Health, Safety & Environmental Management",
      "display_order": 70
    },
    {
      "id": "91000000-0000-4000-8000-000000000008",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.08",
      "label": "Quality Control & Inspections",
      "display_order": 80
    },
    {
      "id": "91000000-0000-4000-8000-000000000009",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.09",
      "label": "As-Built Documentation & Handover",
      "display_order": 90
    },
    {
      "id": "91000000-0000-4000-8000-000000000010",
      "discipline_id": "91000000-0000-4000-8000-000000000001",
      "code": "M100.10",
      "label": "Overall Testing & Project Closeout",
      "display_order": 100
    }
  ],
  "boq_item_definitions": [
    {
      "id": "53ceec5d-9d87-4b03-81fb-f3e50f2c25aa",
      "work_group_id": "b64ae329-9616-4e83-adb1-6cd1a6d08d2e",
      "code": "E100.05.001",
      "label": "Cable 3x2.5",
      "default_unit": "m"
    },
    {
      "id": "4e4a99d3-a606-4f0c-88b5-426a462b1df5",
      "work_group_id": "b64ae329-9616-4e83-adb1-6cd1a6d08d2e",
      "code": "E100.05.002",
      "label": "Cable 5x6",
      "default_unit": "m"
    },
    {
      "id": "ed6ffb3d-2ba6-424d-9c26-72d3a2e96c13",
      "work_group_id": "b64ae329-9616-4e83-adb1-6cd1a6d08d2e",
      "code": "E100.05.003",
      "label": "Cable 5x16",
      "default_unit": "m"
    }
  ],
  "execution_classifications": [
    {
      "execution_work_package_id": "project_wide.electrical.incoming_supply_interface",
      "kind": "MAPPED",
      "work_group_id": "cdd14a6b-d934-4be0-ac32-1654246776d9",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.distribution_panels",
      "kind": "MAPPED",
      "work_group_id": "b624b36a-26a6-4646-8319-58619e39e84b",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.containment",
      "kind": "MAPPED",
      "work_group_id": "2854d48a-477e-4407-b71c-5cea81aeb332",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.power_cabling",
      "kind": "MAPPED",
      "work_group_id": "b64ae329-9616-4e83-adb1-6cd1a6d08d2e",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.small_power",
      "kind": "MAPPED",
      "work_group_id": "52049988-239a-4b00-a3ea-482acf44a8bb",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.lighting_wiring",
      "kind": "MAPPED",
      "work_group_id": "e1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.general_lighting",
      "kind": "MAPPED",
      "work_group_id": "29bd2eb6-e70f-4724-9cd3-de6716d9cc05",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.feature_lighting",
      "kind": "MAPPED",
      "work_group_id": "e1000000-0000-4000-8000-00000000000b",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.emergency_lighting",
      "kind": "MAPPED",
      "work_group_id": "8d9bc17d-28b1-4ec3-aa19-55e73cc4a648",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.emergency_lighting",
      "kind": "MAPPED",
      "work_group_id": "8d9bc17d-28b1-4ec3-aa19-55e73cc4a648",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.lighting_controls",
      "kind": "MAPPED",
      "work_group_id": "e4946f33-9c11-41cf-b83e-5920112ac039",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.earthing_bonding",
      "kind": "MAPPED",
      "work_group_id": "53cb0b86-477b-4c98-9af2-13cb5e3afb26",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.metering",
      "kind": "MAPPED",
      "work_group_id": "cdd14a6b-d934-4be0-ac32-1654246776d9",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.ups",
      "kind": "MAPPED",
      "work_group_id": "02a5d382-8471-4765-a663-1976d4ef416e",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.generator_ats",
      "kind": "MAPPED",
      "work_group_id": "02a5d382-8471-4765-a663-1976d4ef416e",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.busbar",
      "kind": "MAPPED",
      "work_group_id": "b64ae329-9616-4e83-adb1-6cd1a6d08d2e",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.electrical.power_quality",
      "kind": "MAPPED",
      "work_group_id": "df3c2db3-f15f-4b7d-aeeb-cb4cd3fe011d",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.commissioning.electrical_final",
      "kind": "MAPPED",
      "work_group_id": "df3c2db3-f15f-4b7d-aeeb-cb4cd3fe011d",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.preparation.project_setting_out",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.preparation.existing_area_protection",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.demolition.strip_out",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.demolition.structural",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.demolition.mep_disconnect",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.builders_works.openings_penetrations",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.builders_works.core_drilling",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.builders_works.structural_supports",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.builders_works.slab_repairs",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.builders_works.mep_builders_works",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.builders_works.equipment_supports",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.substrates.floor_preparation",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.floor_prep.screed",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.substrates.waterproofing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.substrates.raised_access_floor",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.metal_framing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.plasterboard",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.special",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.acoustic",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.glass",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.doors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.fire_doors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.partitions.access_panels",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.metal_framing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.plasterboard",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.special",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.acoustic",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.doors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.fire_doors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.partitions.access_panels",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.ceilings.framing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.ceilings.gypsum",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.ceilings.suspended_grid",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.ceilings.open_ceiling",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.ceilings.acoustic",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.ceilings.feature",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.finishing.ceiling_final",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.ceilings.framing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.ceilings.gypsum",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.ceilings.suspended_grid",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.ceilings.open_ceiling",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.ceilings.acoustic",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.finishing.ceiling_final",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.surface_preparation",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.painting",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.coverings",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.decorative",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.panels",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.cladding",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.ceramic_tiles",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.mirrors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.wall_finishes.special_coatings",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.surface_preparation",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.painting",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.coverings",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.decorative",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.panels",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.ceramic_tiles",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.wall_finishes.special_coatings",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.tile",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.vinyl_lvt",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.carpet",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.timber_laminate",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.resin_epoxy",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.polished_concrete",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.flooring.skirting_trims",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.tile",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.vinyl_lvt",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.carpet",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.timber_laminate",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.resin_epoxy",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.polished_concrete",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.flooring.skirting_trims",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.shopfront_framing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.shopfront_glazing",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.entrance_doors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.automatic_doors",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.cladding_finishes",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.canopies",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.window_display_infrastructure",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.pre_handover.final_cleaning",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-00000000000a",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.pre_handover.snagging",
      "kind": "MAPPED",
      "work_group_id": "c1000000-0000-4000-8000-00000000000a",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.landlord_interface",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.fcu_installation",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.ahu_installation",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.vrf_vrv",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.split_systems",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.air_curtains",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.server_room_cooling",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.chilled_water_interface",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.refrigerant_piping",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.condensate_drainage",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.ductwork",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.air_distribution",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.ventilation_extract",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.special_exhaust",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.mep_backbone.hvac_controls",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.hvac.bms_integration",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.hvac_tab",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-00000000000a",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.commissioning.hvac_final",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-00000000000a",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.controls_bms",
      "kind": "MAPPED",
      "work_group_id": "c2000000-0000-4000-8000-00000000000a",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.cold_water",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.hot_water",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.drainage",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.floor_drains",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.sanitary",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.special_pumps",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.pantry",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.grease_trap",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.plumbing.water_treatment",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.plumbing",
      "kind": "MAPPED",
      "work_group_id": "c3000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.mep_backbone.sprinkler",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.sprinkler_acceptance",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.fire_alarm",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.panel_interface",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.system_interfaces",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.commissioning.fire_alarm_test",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.mep_backbone.smoke_extraction",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.commissioning.smoke_extraction_test",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.fire_dampers",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "common.mep_backbone.fire_hose_cabinet",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.fhc_acceptance",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.extinguishers",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.fire_stopping",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000009",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.gas_suppression",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.fire.kitchen_suppression",
      "kind": "MAPPED",
      "work_group_id": "c4000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.cctv",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.access_control",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.intrusion_alarm",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.intercom",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.security_glazing",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.security_shutters",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.external.anti_ram",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.access_control",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.cctv",
      "kind": "MAPPED",
      "work_group_id": "c5000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.retail_technology.eas_gates",
      "kind": "MAPPED",
      "work_group_id": "51000000-0000-4000-8000-000000000008",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.external.vertical_transport_interface",
      "kind": "MAPPED",
      "work_group_id": "31000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.structured_cabling",
      "kind": "MAPPED",
      "work_group_id": "c6000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.fiber",
      "kind": "MAPPED",
      "work_group_id": "c6000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.network_rack",
      "kind": "MAPPED",
      "work_group_id": "c6000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.wifi",
      "kind": "MAPPED",
      "work_group_id": "c6000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.pa_music",
      "kind": "MAPPED",
      "work_group_id": "a1000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.av_systems",
      "kind": "MAPPED",
      "work_group_id": "a1000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.low_current.network_equipment",
      "kind": "MAPPED",
      "work_group_id": "c6000000-0000-4000-8000-00000000000a",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.commissioning.low_current",
      "kind": "MAPPED",
      "work_group_id": "c6000000-0000-4000-8000-00000000000c",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.wall_fixtures",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.freestanding",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.display_shelving",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.fitting_rooms",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.cash_desk",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.service_desk",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.furniture.specialist_joinery",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000004",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.furniture.stockroom_shelving",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.furniture.storage_cabinets",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.furniture.lockers",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000006",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.furniture.pantry",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.furniture.office",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.furniture.workstations",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "boh.equipment.staff_facilities",
      "kind": "MAPPED",
      "work_group_id": "c7000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.facade.external_brand_signage",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000001",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.internal_brand",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.wayfinding",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000003",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.regulatory_safety",
      "kind": "MAPPED",
      "work_group_id": "81000000-0000-4000-8000-000000000007",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.window_graphics",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.wall_graphics",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000005",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.menu_boards",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "sales.signage.price_category",
      "kind": "MAPPED",
      "work_group_id": "c8000000-0000-4000-8000-000000000002",
      "reason_code": null
    },
    {
      "execution_work_package_id": "project_wide.refrigeration.cold_rooms",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.refrigeration.freezer_rooms",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.refrigeration.system",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.refrigeration.display_units",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.food_service.kitchen_equipment",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.external.loading_area",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.external.paving_civil",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.pos",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.self_checkout",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.digital_screens",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.interactive_displays",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.esl",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.queue_management",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.click_collect",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "sales.retail_technology.charging",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.low_current.people_counting",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.low_current.digital_signage_infrastructure",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "project_wide.low_current.time_attendance",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "boh.equipment.it_equipment",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "boh.equipment.printers",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "boh.equipment.office_devices",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "boh.equipment.pantry",
      "kind": "DEFERRED",
      "work_group_id": null,
      "reason_code": "DEFERRED_DISCIPLINE"
    },
    {
      "execution_work_package_id": "common.commissioning.integrated_systems_test",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "CROSS_DISCIPLINE_COMMISSIONING"
    },
    {
      "execution_work_package_id": "common.pre_opening.test_reports",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_DOCUMENTATION"
    },
    {
      "execution_work_package_id": "project_wide.handover.as_built",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_DOCUMENTATION"
    },
    {
      "execution_work_package_id": "project_wide.handover.om_manuals",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_DOCUMENTATION"
    },
    {
      "execution_work_package_id": "project_wide.handover.warranties",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_DOCUMENTATION"
    },
    {
      "execution_work_package_id": "project_wide.handover.asset_handover",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_DOCUMENTATION"
    },
    {
      "execution_work_package_id": "project_wide.pre_handover.authority_approvals",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_APPROVAL"
    },
    {
      "execution_work_package_id": "project_wide.pre_handover.landlord_approval",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_APPROVAL"
    },
    {
      "execution_work_package_id": "common.handover.acceptance_act",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_APPROVAL"
    },
    {
      "execution_work_package_id": "common.handover.keys_possession",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_APPROVAL"
    },
    {
      "execution_work_package_id": "common.pre_opening.final_walkthrough",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_INSPECTION"
    },
    {
      "execution_work_package_id": "common.handover.snag_closure",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_INSPECTION"
    },
    {
      "execution_work_package_id": "common.handover.final_inspection",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_INSPECTION"
    },
    {
      "execution_work_package_id": "project_wide.pre_handover.training",
      "kind": "LIFECYCLE",
      "work_group_id": null,
      "reason_code": "LIFECYCLE_TRAINING"
    }
  ]
}
$work_ontology$::jsonb AS data;

INSERT INTO public.work_ontology_versions (
  id, company_id, schema_version, version, label, status, is_active, published_at
)
SELECT
  (data->'version'->>'id')::uuid,
  data->'version'->>'company_id',
  (data->'version'->>'schema_version')::integer,
  (data->'version'->>'version')::integer,
  data->'version'->>'label',
  data->'version'->>'status',
  (data->'version'->>'is_active')::boolean,
  now()
FROM work_ontology_seed_payload
ON CONFLICT (id) DO UPDATE SET
  schema_version = EXCLUDED.schema_version,
  label = EXCLUDED.label,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  published_at = COALESCE(public.work_ontology_versions.published_at, EXCLUDED.published_at);

INSERT INTO public.work_ontology_departments (
  ontology_version_id, id, code, label, display_order
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.code, row.label, row.display_order
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'departments') AS row(
  id uuid, code text, label text, display_order integer
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order;

INSERT INTO public.work_ontology_disciplines (
  ontology_version_id, id, department_id, code, label, display_order, scope_selectable, budget_selectable
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.department_id, row.code, row.label, row.display_order, row.scope_selectable, row.budget_selectable
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'disciplines') AS row(
  id uuid, department_id uuid, code text, label text, display_order integer, scope_selectable boolean, budget_selectable boolean
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  department_id = EXCLUDED.department_id,
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  scope_selectable = EXCLUDED.scope_selectable,
  budget_selectable = EXCLUDED.budget_selectable;

INSERT INTO public.work_ontology_work_groups (
  ontology_version_id, id, discipline_id, code, label, display_order, is_active
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.discipline_id, row.code, row.label, row.display_order, true
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'work_groups') AS row(
  id uuid, discipline_id uuid, code text, label text, display_order integer
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  discipline_id = EXCLUDED.discipline_id,
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  is_active = true;

UPDATE public.work_ontology_work_groups target
SET is_active = false
FROM work_ontology_seed_payload payload
WHERE target.ontology_version_id = (payload.data->'version'->>'id')::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(payload.data->'work_groups') AS desired(id uuid)
    WHERE desired.id = target.id
  );

INSERT INTO public.work_ontology_boq_item_definitions (
  ontology_version_id, id, work_group_id, code, label, default_unit
)
SELECT
  (data->'version'->>'id')::uuid,
  row.id, row.work_group_id, row.code, row.label, row.default_unit
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'boq_item_definitions') AS row(
  id uuid, work_group_id uuid, code text, label text, default_unit text
)
ON CONFLICT (ontology_version_id, id) DO UPDATE SET
  work_group_id = EXCLUDED.work_group_id,
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  default_unit = EXCLUDED.default_unit;

INSERT INTO public.work_ontology_execution_classifications (
  ontology_version_id, execution_work_package_id, kind, work_group_id, reason_code
)
SELECT
  (data->'version'->>'id')::uuid,
  row.execution_work_package_id, row.kind, row.work_group_id, row.reason_code
FROM work_ontology_seed_payload
CROSS JOIN LATERAL jsonb_to_recordset(data->'execution_classifications') AS row(
  execution_work_package_id text, kind text, work_group_id uuid, reason_code text
)
ON CONFLICT (ontology_version_id, execution_work_package_id) DO UPDATE SET
  kind = EXCLUDED.kind,
  work_group_id = EXCLUDED.work_group_id,
  reason_code = EXCLUDED.reason_code;

ALTER TABLE public.work_ontology_disciplines
  ALTER COLUMN department_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_ontology_disciplines_department_fkey'
      AND conrelid = 'public.work_ontology_disciplines'::regclass
  ) THEN
    ALTER TABLE public.work_ontology_disciplines
      ADD CONSTRAINT work_ontology_disciplines_department_fkey
      FOREIGN KEY (ontology_version_id, department_id)
      REFERENCES public.work_ontology_departments(ontology_version_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_immutable_work_ontology_version_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  is_referenced boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE work_ontology_version_id = OLD.id
  ) INTO is_referenced;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' OR is_referenced THEN
      RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'Published or referenced ontology versions cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF (OLD.status <> 'DRAFT' OR is_referenced) AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.label IS DISTINCT FROM OLD.label
  ) THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Create a new ontology version; existing projects remain pinned.';
  END IF;

  IF OLD.status <> 'DRAFT' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_VERSION_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Published or retired ontology versions cannot return to draft.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_immutable_work_ontology_child_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_version_id uuid;
  target_status text;
  is_referenced boolean;
BEGIN
  target_version_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.ontology_version_id ELSE OLD.ontology_version_id END;
  SELECT status INTO target_status
  FROM public.work_ontology_versions
  WHERE id = target_version_id;
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE work_ontology_version_id = target_version_id
  ) INTO is_referenced;

  IF target_status <> 'DRAFT' OR is_referenced THEN
    RAISE EXCEPTION 'WORK_ONTOLOGY_CONTENT_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Create a new ontology version; published or referenced content cannot change.';
  END IF;


  IF TG_OP = 'UPDATE' AND NEW.ontology_version_id IS DISTINCT FROM OLD.ontology_version_id THEN
    SELECT status INTO target_status
    FROM public.work_ontology_versions
    WHERE id = NEW.ontology_version_id;
    SELECT EXISTS (
      SELECT 1 FROM public.projects WHERE work_ontology_version_id = NEW.ontology_version_id
    ) INTO is_referenced;
    IF target_status <> 'DRAFT' OR is_referenced THEN
      RAISE EXCEPTION 'WORK_ONTOLOGY_CONTENT_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'Content cannot be moved into a published or referenced ontology version.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS work_ontology_version_immutable ON public.work_ontology_versions;
CREATE TRIGGER work_ontology_version_immutable
  BEFORE UPDATE OR DELETE ON public.work_ontology_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_version_change();

DROP TRIGGER IF EXISTS work_ontology_departments_immutable ON public.work_ontology_departments;
CREATE TRIGGER work_ontology_departments_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_departments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_disciplines_immutable ON public.work_ontology_disciplines;
CREATE TRIGGER work_ontology_disciplines_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_disciplines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_work_groups_immutable ON public.work_ontology_work_groups;
CREATE TRIGGER work_ontology_work_groups_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_work_groups
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_boq_definitions_immutable ON public.work_ontology_boq_item_definitions;
CREATE TRIGGER work_ontology_boq_definitions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_boq_item_definitions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();
DROP TRIGGER IF EXISTS work_ontology_execution_classifications_immutable ON public.work_ontology_execution_classifications;
CREATE TRIGGER work_ontology_execution_classifications_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_ontology_execution_classifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_work_ontology_child_change();

ALTER TABLE public.work_ontology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_disciplines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_boq_item_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_ontology_execution_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_ontology_versions_select" ON public.work_ontology_versions;
CREATE POLICY "work_ontology_versions_select" ON public.work_ontology_versions
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_global_admin()
      OR company_id IS NULL
      OR company_id = public.current_company_id()
    )
  );

DROP POLICY IF EXISTS "work_ontology_departments_select" ON public.work_ontology_departments;
CREATE POLICY "work_ontology_departments_select" ON public.work_ontology_departments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_disciplines_select" ON public.work_ontology_disciplines;
CREATE POLICY "work_ontology_disciplines_select" ON public.work_ontology_disciplines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_work_groups_select" ON public.work_ontology_work_groups;
CREATE POLICY "work_ontology_work_groups_select" ON public.work_ontology_work_groups
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_boq_item_definitions_select" ON public.work_ontology_boq_item_definitions;
CREATE POLICY "work_ontology_boq_item_definitions_select" ON public.work_ontology_boq_item_definitions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));
DROP POLICY IF EXISTS "work_ontology_execution_classifications_select" ON public.work_ontology_execution_classifications;
CREATE POLICY "work_ontology_execution_classifications_select" ON public.work_ontology_execution_classifications
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.work_ontology_versions version
    WHERE version.id = ontology_version_id
      AND auth.uid() IS NOT NULL
      AND (public.is_global_admin() OR version.company_id IS NULL OR version.company_id = public.current_company_id())
  ));

REVOKE ALL ON TABLE public.work_ontology_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_departments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_disciplines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_work_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_boq_item_definitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_ontology_execution_classifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.work_ontology_versions TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_departments TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_disciplines TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_work_groups TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_boq_item_definitions TO authenticated;
GRANT SELECT ON TABLE public.work_ontology_execution_classifications TO authenticated;

REVOKE ALL ON FUNCTION public.prevent_immutable_work_ontology_version_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_immutable_work_ontology_child_change() FROM PUBLIC, anon, authenticated;

COMMIT;
