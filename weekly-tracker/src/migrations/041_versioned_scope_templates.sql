-- 041_versioned_scope_templates.sql
-- Versioned/pinned V2 scope-template foundation.
--
-- Additive only:
-- - retains every legacy template/project column and row;
-- - adds company/global family routing to public.templates;
-- - freezes referenced template semantics at the database boundary;
-- - narrows template RLS to global + caller-company reads and admin writes;
-- - seeds the exact certified Retail Fit-Out V2 definition as global version 1.
--
-- Generated deterministically by:
--   node scripts/generateVersionedScopeTemplateMigration.mjs
-- Certified V2 WP-id SHA-256:
--   fcf008a091073fb8741d8e2641bfd7b8bf2e5b51043a9b6bf0fb8c1714144566

BEGIN;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS company_id text;

COMMENT ON COLUMN public.templates.family IS
  'Stable routing family; family_id remains the immutable version-lineage UUID.';
COMMENT ON COLUMN public.templates.company_id IS
  'NULL is a global OpenDay template; non-NULL is private to that company.';

CREATE INDEX IF NOT EXISTS templates_company_family_lookup
  ON public.templates (company_id, family, is_active, version DESC);

CREATE UNIQUE INDEX IF NOT EXISTS templates_owner_family_version_uniq
  ON public.templates (company_id, family, version) NULLS NOT DISTINCT
  WHERE family IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS templates_one_active_per_owner_family
  ON public.templates (company_id, family) NULLS NOT DISTINCT
  WHERE family IS NOT NULL AND is_active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_template_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_template_id_fkey
      FOREIGN KEY (template_id)
      REFERENCES public.templates(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_versioned_scope_data_check'
      AND conrelid = 'public.templates'::regclass
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_versioned_scope_data_check
      CHECK (
        family IS DISTINCT FROM 'retail-fitout-v2'
        OR (
          jsonb_typeof(data) = 'object'
          AND data->>'schemaVersion' = '1'
          AND data->>'model' = 'zoned'
          AND data->>'templateType' = 'retail-fitout-v2'
          AND jsonb_typeof(data->'zones') = 'array'
          AND jsonb_typeof(data->'dependencies') = 'array'
        )
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.templates
  VALIDATE CONSTRAINT templates_versioned_scope_data_check;

CREATE OR REPLACE FUNCTION public.prevent_referenced_template_semantic_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.projects
    WHERE template_id = OLD.id
  ) AND (
    NEW.data IS DISTINCT FROM OLD.data
    OR NEW.family IS DISTINCT FROM OLD.family
    OR NEW.family_id IS DISTINCT FROM OLD.family_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.version IS DISTINCT FROM OLD.version
  ) THEN
    RAISE EXCEPTION 'REFERENCED_TEMPLATE_IMMUTABLE'
      USING ERRCODE = '23514',
            DETAIL = 'Create a new template version and select it as the default; existing projects remain pinned.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS templates_referenced_semantics_immutable ON public.templates;
CREATE TRIGGER templates_referenced_semantics_immutable
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_referenced_template_semantic_change();

DROP POLICY IF EXISTS "templates_select" ON public.templates;
DROP POLICY IF EXISTS "templates_insert" ON public.templates;
DROP POLICY IF EXISTS "templates_update" ON public.templates;
DROP POLICY IF EXISTS "templates_delete" ON public.templates;

CREATE POLICY "templates_select"
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_global_admin()
      OR company_id IS NULL
      OR company_id = public.current_company_id()
    )
  );

CREATE POLICY "templates_insert"
  ON public.templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

CREATE POLICY "templates_update"
  ON public.templates
  FOR UPDATE
  TO authenticated
  USING (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

CREATE POLICY "templates_delete"
  ON public.templates
  FOR DELETE
  TO authenticated
  USING (
    public.is_global_admin()
    OR (
      public.get_my_role() = 'admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

INSERT INTO public.templates (
  id,
  name,
  data,
  is_active,
  family_id,
  family,
  company_id,
  version
) VALUES (
  'dc92175a-251c-45ab-a4fd-c83c1c668ef4',
  'Retail Fit-Out (Zoned)',
  $scope_template$
{
  "schemaVersion": 1,
  "model": "zoned",
  "templateType": "retail-fitout-v2",
  "label": "Retail Fit-Out (Zoned)",
  "zones": [
    {
      "id": "common",
      "label": "Common Works",
      "weightMode": "fixed",
      "fixedWeight": 35,
      "categories": [
        {
          "id": "common.demolition",
          "weight": 8,
          "label": "Demolition",
          "workPackages": [
            {
              "id": "common.demolition.strip_out",
              "label": "Strip Out & Clear",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "common.demolition.structural",
              "label": "Structural Demolition",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "common.demolition.mep_disconnect",
              "label": "MEP Disconnection",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "common.floor_prep",
          "weight": 5,
          "label": "Floor Preparation",
          "workPackages": [
            {
              "id": "common.floor_prep.screed",
              "label": "Screed / Self-Levelling",
              "durationPct": 1,
              "isBlocker": true,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "common.construction",
          "weight": 15,
          "label": "Construction Works",
          "workPackages": [
            {
              "id": "common.construction.wall_marking",
              "label": "Wall Marking & Setting Out",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "common.construction.openings",
              "label": "Openings / Supports / Reinforcements",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "common.construction.facade",
              "label": "Facade Installation",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "common.mep_backbone",
          "weight": 40,
          "label": "MEP Backbone Works",
          "workPackages": [
            {
              "id": "common.mep_backbone.electrical_panels",
              "label": "Electrical Panels & Distribution",
              "durationPct": 0.13,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 4,
              "responsibleRole": "GC"
            },
            {
              "id": "common.mep_backbone.emergency_power",
              "label": "Emergency Power / UPS Installation",
              "durationPct": 0.13,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            },
            {
              "id": "common.mep_backbone.hvac_equipment",
              "label": "HVAC Equipment Installation",
              "durationPct": 0.13,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 5,
              "responsibleRole": "GC"
            },
            {
              "id": "common.mep_backbone.hvac_controls",
              "label": "HVAC Controls Installation",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "common.mep_backbone.sprinkler",
              "label": "Sprinkler System Installation",
              "durationPct": 0.13,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 4,
              "responsibleRole": "GC"
            },
            {
              "id": "common.mep_backbone.smoke_detection",
              "label": "Smoke Detection System Installation",
              "durationPct": 0.13,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            },
            {
              "id": "common.mep_backbone.smoke_extraction",
              "label": "Smoke Extraction System Installation",
              "durationPct": 0.13,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 4,
              "responsibleRole": "GC"
            },
            {
              "id": "common.mep_backbone.fire_hose_cabinet",
              "label": "Fire Hose Cabinet System Installation",
              "durationPct": 0.09,
              "isBlocker": false,
              "openingBlocker": "soft",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            }
          ]
        },
        {
          "id": "common.commissioning",
          "weight": 15,
          "label": "Commissioning",
          "workPackages": [
            {
              "id": "common.commissioning.electrical_final",
              "label": "Electrical Final Commissioning",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            },
            {
              "id": "common.commissioning.hvac_final",
              "label": "HVAC Final Balancing / Commissioning",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            },
            {
              "id": "common.commissioning.fire_alarm_test",
              "label": "Fire Alarm Scenario Test",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "common.commissioning.smoke_extraction_test",
              "label": "Smoke Extraction Integrated Test",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "common.commissioning.sprinkler_fhc_test",
              "label": "Sprinkler / FHC Acceptance Test",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "common.commissioning.bms_integration",
              "label": "BMS / Controls Integration",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "soft",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            },
            {
              "id": "common.commissioning.integrated_systems_test",
              "label": "Integrated Systems Test",
              "durationPct": 0.16,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 4,
              "responsibleRole": "GC"
            }
          ]
        },
        {
          "id": "common.pre_opening",
          "weight": 7,
          "label": "Pre-Opening",
          "workPackages": [
            {
              "id": "common.pre_opening.test_reports",
              "label": "Test Reports / Certificates Package",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "PM"
            },
            {
              "id": "common.pre_opening.authority_approvals",
              "label": "Authority / Landlord Opening Approvals",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 5,
              "responsibleRole": "Landlord"
            },
            {
              "id": "common.pre_opening.final_walkthrough",
              "label": "Final Readiness Walkthrough",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": "soft",
              "typicalClearDays": 1,
              "responsibleRole": "PM"
            }
          ]
        },
        {
          "id": "common.handover",
          "weight": 10,
          "label": "Handover",
          "workPackages": [
            {
              "id": "common.handover.final_inspection",
              "label": "Final Inspection",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "Landlord"
            },
            {
              "id": "common.handover.snag_closure",
              "label": "Final Snag Closure Confirmation",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "common.handover.acceptance_act",
              "label": "Acceptance & Transfer Act",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "Landlord"
            },
            {
              "id": "common.handover.keys_possession",
              "label": "Keys & Possession",
              "durationPct": 0.2,
              "isBlocker": true,
              "openingBlocker": "critical",
              "typicalClearDays": 1,
              "responsibleRole": "Landlord"
            },
            {
              "id": "common.handover.om_manuals",
              "label": "O&M Manuals / Warranty Package",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": "soft",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            }
          ]
        }
      ]
    },
    {
      "id": "sales",
      "label": "Sales Area",
      "weightMode": "area",
      "defaultWeight": 45,
      "areaField": "salesAreaSqm",
      "categories": [
        {
          "id": "sales.flooring",
          "weight": 10,
          "label": "Flooring Works",
          "workPackages": [
            {
              "id": "sales.flooring.waterproof",
              "label": "Waterproofing / Surface Preparation",
              "durationPct": 0.33,
              "isBlocker": true,
              "openingBlocker": false
            },
            {
              "id": "sales.flooring.tile",
              "label": "Floor Tile Installation",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.flooring.grout",
              "label": "Grouting / Protection",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "sales.construction",
          "weight": 12,
          "label": "Construction Works",
          "workPackages": [
            {
              "id": "sales.construction.wall_framing",
              "label": "Wall Framing / Partitions",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.construction.rough_ceiling",
              "label": "Rough Ceiling Installation",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.construction.wall_closing",
              "label": "Wall Board & Closing",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "sales.mep_install",
          "weight": 25,
          "label": "MEP Installation Works",
          "workPackages": [
            {
              "id": "sales.mep_install.elec_trays",
              "label": "Electrical Cable Trays / Conduits",
              "durationPct": 0.17,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.mep_install.elec_cabling",
              "label": "Electrical Power Cabling",
              "durationPct": 0.17,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.mep_install.hvac_ductwork",
              "label": "HVAC Ductwork",
              "durationPct": 0.17,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.mep_install.hvac_piping",
              "label": "HVAC Piping / Refrigerant Lines",
              "durationPct": 0.17,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.mep_install.water_supply",
              "label": "Water Supply Installation",
              "durationPct": 0.17,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.mep_install.drainage",
              "label": "Drainage / Wastewater Installation",
              "durationPct": 0.15,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "sales.finishing",
          "weight": 20,
          "label": "Finishing Works",
          "workPackages": [
            {
              "id": "sales.finishing.wall_paint",
              "label": "Wall Plaster / Putty / Paint",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.finishing.wall_cladding",
              "label": "Wall Cladding / Special Finishes",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.finishing.ceiling_grid",
              "label": "Ceiling Grid / Gypsum Ceiling",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.finishing.ceiling_final",
              "label": "Ceiling Final Finish",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.finishing.skirting",
              "label": "Skirting / Trims",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.finishing.doors",
              "label": "Doors / Hardware",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.finishing.signage_prep",
              "label": "Signage / Branding Preparation",
              "durationPct": 0.16,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "sales.end_devices",
          "weight": 18,
          "label": "End Devices",
          "workPackages": [
            {
              "id": "sales.end_devices.general_lighting",
              "label": "General Lighting Fixtures",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.end_devices.emergency_lighting",
              "label": "Emergency Lighting / Exit Signs",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "sales.end_devices.sockets_switches",
              "label": "Sockets / Switches / Floor Boxes",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.end_devices.hvac_grilles",
              "label": "HVAC Grilles / Diffusers / Thermostats",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.end_devices.fire_detectors",
              "label": "Fire Detectors / Manual Call Points",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "sales.end_devices.audio_pa",
              "label": "Audio / PA / Music Equipment",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.end_devices.access_control",
              "label": "Access Control / Security Devices",
              "durationPct": 0.13,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.end_devices.cctv",
              "label": "CCTV / Low Current Devices",
              "durationPct": 0.09,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "sales.furniture",
          "weight": 8,
          "label": "Furniture",
          "workPackages": [
            {
              "id": "sales.furniture.sales_furniture",
              "label": "Sales Floor Furniture",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "sales.furniture.cash_desk",
              "label": "Cash Desk",
              "durationPct": 0.33,
              "isBlocker": true,
              "openingBlocker": false
            },
            {
              "id": "sales.furniture.fitting_rooms",
              "label": "Fitting Rooms",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "sales.pre_opening",
          "weight": 4,
          "label": "Pre-Opening",
          "workPackages": [
            {
              "id": "sales.pre_opening.deep_cleaning",
              "label": "Deep Cleaning",
              "durationPct": 0.5,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "sales.pre_opening.staff_training",
              "label": "Staff Training",
              "durationPct": 0.5,
              "isBlocker": false,
              "openingBlocker": "soft",
              "typicalClearDays": 3,
              "responsibleRole": "PM"
            }
          ]
        },
        {
          "id": "sales.commissioning",
          "weight": 3,
          "label": "Commissioning",
          "workPackages": [
            {
              "id": "sales.commissioning.snagging",
              "label": "Snagging / Punch List Closure",
              "durationPct": 1,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            }
          ]
        }
      ]
    },
    {
      "id": "boh",
      "label": "Back of House",
      "weightMode": "area",
      "defaultWeight": 20,
      "areaField": "bohAreaSqm",
      "categories": [
        {
          "id": "boh.flooring",
          "weight": 12,
          "label": "Flooring Works",
          "workPackages": [
            {
              "id": "boh.flooring.waterproof",
              "label": "Waterproofing / Surface Preparation",
              "durationPct": 0.33,
              "isBlocker": true,
              "openingBlocker": false
            },
            {
              "id": "boh.flooring.tile",
              "label": "Floor Tile Installation",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.flooring.grout",
              "label": "Grouting / Protection",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "boh.construction",
          "weight": 15,
          "label": "Construction Works",
          "workPackages": [
            {
              "id": "boh.construction.wall_framing",
              "label": "Wall Framing / Partitions",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.construction.rough_ceiling",
              "label": "Rough Ceiling Installation",
              "durationPct": 0.33,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.construction.wall_closing",
              "label": "Wall Board & Closing",
              "durationPct": 0.34,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "boh.mep_install",
          "weight": 30,
          "label": "MEP Installation Works",
          "workPackages": [
            {
              "id": "boh.mep_install.elec_trays",
              "label": "Electrical Cable Trays / Conduits",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.mep_install.elec_cabling",
              "label": "Electrical Power Cabling",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.mep_install.hvac_ductwork",
              "label": "HVAC Ductwork",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.mep_install.hvac_piping",
              "label": "HVAC Piping / Refrigerant Lines",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.mep_install.water_supply",
              "label": "Water Supply Installation",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.mep_install.drainage",
              "label": "Drainage / Wastewater Installation",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.mep_install.sanitary_connect",
              "label": "Sanitary Connection Installation",
              "durationPct": 0.16,
              "isBlocker": true,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "boh.finishing",
          "weight": 15,
          "label": "Finishing Works",
          "workPackages": [
            {
              "id": "boh.finishing.wall_paint",
              "label": "Wall Plaster / Putty / Paint",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.finishing.ceiling_grid",
              "label": "Ceiling Grid / Gypsum Ceiling",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.finishing.ceiling_final",
              "label": "Ceiling Final Finish",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.finishing.skirting",
              "label": "Skirting / Trims",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.finishing.doors",
              "label": "Doors / Hardware",
              "durationPct": 0.2,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "boh.end_devices",
          "weight": 15,
          "label": "End Devices",
          "workPackages": [
            {
              "id": "boh.end_devices.general_lighting",
              "label": "General Lighting Fixtures",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.end_devices.emergency_lighting",
              "label": "Emergency Lighting / Exit Signs",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "boh.end_devices.sockets_switches",
              "label": "Sockets / Switches / Floor Boxes",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.end_devices.hvac_grilles",
              "label": "HVAC Grilles / Diffusers / Thermostats",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.end_devices.fire_detectors",
              "label": "Fire Detectors / Manual Call Points",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            },
            {
              "id": "boh.end_devices.access_control",
              "label": "Access Control / Security Devices",
              "durationPct": 0.14,
              "isBlocker": false,
              "openingBlocker": false
            },
            {
              "id": "boh.end_devices.cctv",
              "label": "CCTV / Low Current Devices",
              "durationPct": 0.16,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "boh.furniture",
          "weight": 5,
          "label": "Furniture",
          "workPackages": [
            {
              "id": "boh.furniture.boh_furniture",
              "label": "Back of House Furniture",
              "durationPct": 1,
              "isBlocker": false,
              "openingBlocker": false
            }
          ]
        },
        {
          "id": "boh.pre_opening",
          "weight": 5,
          "label": "Pre-Opening",
          "workPackages": [
            {
              "id": "boh.pre_opening.deep_cleaning",
              "label": "Deep Cleaning",
              "durationPct": 1,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 2,
              "responsibleRole": "GC"
            }
          ]
        },
        {
          "id": "boh.commissioning",
          "weight": 3,
          "label": "Commissioning",
          "workPackages": [
            {
              "id": "boh.commissioning.snagging",
              "label": "Snagging / Punch List Closure",
              "durationPct": 1,
              "isBlocker": false,
              "openingBlocker": "critical",
              "typicalClearDays": 3,
              "responsibleRole": "GC"
            }
          ]
        }
      ]
    }
  ],
  "dependencies": [
    {
      "from": "common.demolition.strip_out",
      "to": "common.floor_prep.screed",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.demolition.structural",
      "to": "common.floor_prep.screed",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.demolition.mep_disconnect",
      "to": "common.floor_prep.screed",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.floor_prep.screed",
      "to": "common.construction.wall_marking",
      "type": "FS",
      "lagDays": 10
    },
    {
      "from": "common.floor_prep.screed",
      "to": "common.construction.openings",
      "type": "FS",
      "lagDays": 10
    },
    {
      "from": "common.floor_prep.screed",
      "to": "common.construction.facade",
      "type": "FS",
      "lagDays": 10
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.electrical_panels",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.emergency_power",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.hvac_equipment",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.hvac_controls",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.sprinkler",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.smoke_detection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.smoke_extraction",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.wall_marking",
      "to": "common.mep_backbone.fire_hose_cabinet",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.electrical_panels",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.emergency_power",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.hvac_equipment",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.hvac_controls",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.sprinkler",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.smoke_detection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.smoke_extraction",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.openings",
      "to": "common.mep_backbone.fire_hose_cabinet",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.electrical_panels",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.emergency_power",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.hvac_equipment",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.hvac_controls",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.sprinkler",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.smoke_detection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.smoke_extraction",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.construction.facade",
      "to": "common.mep_backbone.fire_hose_cabinet",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.electrical_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.hvac_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.fire_alarm_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.smoke_extraction_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.sprinkler_fhc_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.bms_integration",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.electrical_final",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.electrical_final",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.electrical_final",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.hvac_final",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.hvac_final",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.hvac_final",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.fire_alarm_test",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.fire_alarm_test",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.fire_alarm_test",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.smoke_extraction_test",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.smoke_extraction_test",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.smoke_extraction_test",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.sprinkler_fhc_test",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.sprinkler_fhc_test",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.sprinkler_fhc_test",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.bms_integration",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.bms_integration",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.bms_integration",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.integrated_systems_test",
      "to": "common.pre_opening.test_reports",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.integrated_systems_test",
      "to": "common.pre_opening.authority_approvals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.commissioning.integrated_systems_test",
      "to": "common.pre_opening.final_walkthrough",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.handover.final_inspection",
      "to": "common.handover.snag_closure",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.handover.snag_closure",
      "to": "common.handover.acceptance_act",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.handover.acceptance_act",
      "to": "common.handover.keys_possession",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.handover.snag_closure",
      "to": "common.handover.om_manuals",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.pre_opening.test_reports",
      "to": "common.handover.final_inspection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.pre_opening.authority_approvals",
      "to": "common.handover.final_inspection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.pre_opening.final_walkthrough",
      "to": "common.handover.final_inspection",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.flooring.waterproof",
      "to": "sales.flooring.tile",
      "type": "FS",
      "lagDays": 2
    },
    {
      "from": "sales.flooring.tile",
      "to": "sales.flooring.grout",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.flooring.grout",
      "to": "sales.construction.wall_framing",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.flooring.grout",
      "to": "sales.construction.rough_ceiling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.flooring.grout",
      "to": "sales.construction.wall_closing",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_framing",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_framing",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_framing",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_framing",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_framing",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_framing",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.rough_ceiling",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.rough_ceiling",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.rough_ceiling",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.rough_ceiling",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.rough_ceiling",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.rough_ceiling",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_closing",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_closing",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_closing",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_closing",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_closing",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.construction.wall_closing",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.wall_cladding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_trays",
      "to": "sales.finishing.signage_prep",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.wall_cladding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.elec_cabling",
      "to": "sales.finishing.signage_prep",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.wall_cladding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_ductwork",
      "to": "sales.finishing.signage_prep",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.wall_cladding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.hvac_piping",
      "to": "sales.finishing.signage_prep",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.wall_cladding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.water_supply",
      "to": "sales.finishing.signage_prep",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.wall_cladding",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.mep_install.drainage",
      "to": "sales.finishing.signage_prep",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_paint",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.wall_cladding",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_grid",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.ceiling_final",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.skirting",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.doors",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.audio_pa",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.finishing.signage_prep",
      "to": "sales.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.general_lighting",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.general_lighting",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.general_lighting",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.emergency_lighting",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.emergency_lighting",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.emergency_lighting",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.sockets_switches",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.sockets_switches",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.sockets_switches",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.hvac_grilles",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.hvac_grilles",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.hvac_grilles",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.fire_detectors",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.fire_detectors",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.fire_detectors",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.audio_pa",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.audio_pa",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.audio_pa",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.access_control",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.access_control",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.access_control",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.cctv",
      "to": "sales.furniture.sales_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.cctv",
      "to": "sales.furniture.cash_desk",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.end_devices.cctv",
      "to": "sales.furniture.fitting_rooms",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.furniture.sales_furniture",
      "to": "sales.commissioning.snagging",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.furniture.cash_desk",
      "to": "sales.commissioning.snagging",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.furniture.fitting_rooms",
      "to": "sales.commissioning.snagging",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.commissioning.snagging",
      "to": "sales.pre_opening.deep_cleaning",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.commissioning.snagging",
      "to": "sales.pre_opening.staff_training",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.flooring.waterproof",
      "to": "boh.flooring.tile",
      "type": "FS",
      "lagDays": 2
    },
    {
      "from": "boh.flooring.tile",
      "to": "boh.flooring.grout",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.flooring.grout",
      "to": "boh.construction.wall_framing",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.flooring.grout",
      "to": "boh.construction.rough_ceiling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.flooring.grout",
      "to": "boh.construction.wall_closing",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_framing",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.rough_ceiling",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.construction.wall_closing",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_trays",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_trays",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_trays",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_trays",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_trays",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_cabling",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_cabling",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_cabling",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_cabling",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.elec_cabling",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_ductwork",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_ductwork",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_ductwork",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_ductwork",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_ductwork",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_piping",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_piping",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_piping",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_piping",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.hvac_piping",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.water_supply",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.water_supply",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.water_supply",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.water_supply",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.water_supply",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.drainage",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.drainage",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.drainage",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.drainage",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.drainage",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.sanitary_connect",
      "to": "boh.finishing.wall_paint",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.sanitary_connect",
      "to": "boh.finishing.ceiling_grid",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.sanitary_connect",
      "to": "boh.finishing.ceiling_final",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.sanitary_connect",
      "to": "boh.finishing.skirting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.mep_install.sanitary_connect",
      "to": "boh.finishing.doors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.wall_paint",
      "to": "boh.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_grid",
      "to": "boh.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.ceiling_final",
      "to": "boh.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.skirting",
      "to": "boh.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.general_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.emergency_lighting",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.sockets_switches",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.hvac_grilles",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.fire_detectors",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.access_control",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.finishing.doors",
      "to": "boh.end_devices.cctv",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.general_lighting",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.emergency_lighting",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.sockets_switches",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.hvac_grilles",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.fire_detectors",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.access_control",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.end_devices.cctv",
      "to": "boh.furniture.boh_furniture",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.furniture.boh_furniture",
      "to": "boh.commissioning.snagging",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.commissioning.snagging",
      "to": "boh.pre_opening.deep_cleaning",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "sales.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "sales.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "sales.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "sales.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "sales.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "sales.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.electrical_panels",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.emergency_power",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_equipment",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.hvac_controls",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.sprinkler",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_detection",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.smoke_extraction",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.elec_trays",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.elec_cabling",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.hvac_ductwork",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.hvac_piping",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.water_supply",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.drainage",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "common.mep_backbone.fire_hose_cabinet",
      "to": "boh.mep_install.sanitary_connect",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "sales.commissioning.snagging",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    },
    {
      "from": "boh.commissioning.snagging",
      "to": "common.commissioning.integrated_systems_test",
      "type": "FS",
      "lagDays": 0
    }
  ],
  "schedule": {
    "completionMarkerWpId": "common.commissioning.integrated_systems_test",
    "openingMarkerWpId": "common.handover.keys_possession"
  },
  "identity": {
    "workPackageCount": 91,
    "workPackageIdSha256": "fcf008a091073fb8741d8e2641bfd7b8bf2e5b51043a9b6bf0fb8c1714144566"
  }
}
$scope_template$::jsonb,
  true,
  '8fd1ec34-81b7-4e2f-aafd-ae8d610f77f8',
  'retail-fitout-v2',
  NULL,
  1
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
