-- 045_master_catalog_duration_calibration.sql
-- Slice 5F.2B — finalizes the exact inactive/unreferenced weighted candidate
-- in place with the owner-approved schema-v2 Duration Model metadata.
--
-- Generated deterministically by:
--   node scripts/generateMasterCatalogDurationMigration.mjs
-- Canonical source:
--   src/domains/construction/templates/retailFitoutMasterCatalog.js
--
-- Fail-closed guards:
-- - exact global retail-fitout-v2 candidate id/family/family_id/version;
-- - data.schemaVersion = 2 and is_active = false;
-- - zero public.projects references;
-- - data equals the exact pre-duration weighted source form, proving frozen
--   structure, default scope, Weight metadata, and absence of prior duration.
--
-- Only public.templates.data for this one row is updated. No v1/project/RLS/
-- grant/policy/schema/default/activation change is performed. Reapplication
-- fails explicitly because the row is no longer in the pre-duration state.
--
-- Duration fingerprints:
--   mode:                 a2f7b3b11b1cda109577716d2638cdbb57eabee0f34d6154ad1bb3f7273b615f
--   execution base days:  1d298383b908cb60181b265fcba4c36e88f9cde9f14c49ff04bda2ba1d2c0a74
--   area basis:           14c2e8da22f60123eb6d195bda528d3f0ef04863cc2928dd21e89c05f64064f1
--   reference areas:      a2f48d2599f151a56e7f31f2463b0c3437fed2f6af439a5f85cb5ca0e665b7a4
--   bands:                d8c4e3f0ce7d9d8a36853093c5c15ed5ed3f958f8aff4beb8eed8e1b2e6b18d6
--   milestone set:        fab66061e779784bfe04ef7bc2306469fc4c6d1648c452bb62edd2186a5b8a9f
--   excluded set:         01a2caadafee01d1393b60cd21b9be560346b2d140d2ad009b10c06a2d638953
--   complete Duration:    8633a34bc29cc54295ece23bd2be19b96cb08999730d8395b4902e1328289382
--   final operational:    9591057e34c9fb4a54d04f6ae3d1971318512f37a1cdb1d10755de06401e5287

BEGIN;

DO $migration$
DECLARE
  candidate_count integer;
  project_reference_count integer;
  affected_rows integer;
  current_data jsonb;
BEGIN
  SELECT count(*)
    INTO candidate_count
    FROM public.templates
   WHERE id = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29'
     AND family = 'retail-fitout-v2'
     AND family_id = '8fd1ec34-81b7-4e2f-aafd-ae8d610f77f8'
     AND company_id IS NULL
     AND version = 2
     AND data->>'schemaVersion' = '2'
     AND is_active = false;

  IF candidate_count <> 1 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_CANDIDATE_IDENTITY_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  SELECT data
    INTO current_data
    FROM public.templates
   WHERE id = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29'
   FOR UPDATE;

  SELECT count(*)
    INTO project_reference_count
    FROM public.projects
   WHERE template_id = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29';

  IF project_reference_count <> 0 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_CANDIDATE_REFERENCED'
      USING ERRCODE = '23514';
  END IF;

  IF current_data IS DISTINCT FROM $pre_duration$
{
  "schemaVersion": 2,
  "model": "zoned",
  "templateType": "retail-fitout-v2",
  "label": "Retail Fit-Out (Master Catalog)",
  "zones": [
    {
      "id": "project_wide",
      "label": "Project-Wide Works",
      "areaBasis": "NONE",
      "anchorPct": 40,
      "categories": [
        {
          "id": "project_wide.preparation_demolition",
          "label": "Preparation & Demolition",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.preparation.project_setting_out",
              "label": "Project Setting Out",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.preparation.existing_area_protection",
              "label": "Existing-Area Protection & Hoarding",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "common.demolition.strip_out",
              "label": "Strip Out & Clearance",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "common.demolition.structural",
              "label": "Structural Demolition",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "common.demolition.mep_disconnect",
              "label": "MEP Isolation & Disconnection",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            }
          ]
        },
        {
          "id": "project_wide.builders_works_substrates",
          "label": "Builders' Works & Substrates",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.builders_works.openings_penetrations",
              "label": "Builder's Openings & Penetrations",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.builders_works.core_drilling",
              "label": "Core Drilling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.builders_works.structural_supports",
              "label": "Structural Supports & Reinforcements",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.builders_works.slab_repairs",
              "label": "Slab Repairs",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.builders_works.mep_builders_works",
              "label": "Builder's Works Associated with MEP",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.substrates.floor_preparation",
              "label": "Floor Substrate Preparation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "common.floor_prep.screed",
              "label": "Screeding & Self-Levelling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.substrates.waterproofing",
              "label": "Waterproofing Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.substrates.raised_access_floor",
              "label": "Raised Access Floor Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.builders_works.equipment_supports",
              "label": "Equipment Supports & Access Platforms",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "project_wide.electrical",
          "label": "Electrical",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "project_wide.electrical.incoming_supply_interface",
              "label": "Incoming Supply & Landlord Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.electrical.distribution_panels",
              "label": "Main & Sub-Distribution Panels",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.electrical.containment",
              "label": "Electrical Containment & Cable Trays",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.electrical.power_cabling",
              "label": "Power Cabling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.electrical.small_power",
              "label": "Small Power, Sockets & Floor Boxes",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.electrical.lighting_wiring",
              "label": "Lighting Power & Control Wiring",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.electrical.general_lighting",
              "label": "General Lighting Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.electrical.feature_lighting",
              "label": "Feature & Decorative Lighting",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.electrical.emergency_lighting",
              "label": "Emergency Lighting & Exit Signs",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.electrical.lighting_controls",
              "label": "Lighting Controls & Dimming",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.electrical.earthing_bonding",
              "label": "Earthing & Bonding",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.electrical.metering",
              "label": "Electrical Metering",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.electrical.ups",
              "label": "UPS Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.electrical.generator_ats",
              "label": "Generator & ATS Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 9
            },
            {
              "id": "project_wide.electrical.busbar",
              "label": "Busbar Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.electrical.power_quality",
              "label": "Power Quality / Power-Factor Equipment",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "project_wide.hvac",
          "label": "HVAC",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "project_wide.hvac.landlord_interface",
              "label": "Landlord HVAC Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.hvac.fcu_installation",
              "label": "FCU Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.hvac.ahu_installation",
              "label": "AHU Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.hvac.vrf_vrv",
              "label": "VRF / VRV System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "project_wide.hvac.split_systems",
              "label": "Split AC System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.hvac.chilled_water_interface",
              "label": "Chilled-Water Interface & Piping",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.hvac.refrigerant_piping",
              "label": "Refrigerant Piping",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.hvac.condensate_drainage",
              "label": "HVAC Condensate Drainage",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.hvac.ductwork",
              "label": "HVAC Ductwork",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.hvac.air_distribution",
              "label": "Grilles & Diffusers",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.hvac.air_curtains",
              "label": "Air Curtain Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.hvac.ventilation_extract",
              "label": "Ventilation & Extract Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.hvac.special_exhaust",
              "label": "Kitchen / Specialist Exhaust",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "common.mep_backbone.hvac_controls",
              "label": "HVAC Controls Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.hvac.bms_integration",
              "label": "BMS Integration",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.hvac.server_room_cooling",
              "label": "Server-Room Cooling",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 4
            }
          ]
        },
        {
          "id": "project_wide.plumbing_drainage",
          "label": "Plumbing & Drainage",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.plumbing.cold_water",
              "label": "Cold-Water Supply",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.plumbing.hot_water",
              "label": "Hot-Water Supply & Water Heater",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.plumbing.drainage",
              "label": "Drainage & Wastewater",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.plumbing.sanitary",
              "label": "Sanitary Fixtures & Connections",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.plumbing.floor_drains",
              "label": "Floor Drains",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.plumbing.special_pumps",
              "label": "Booster / Sump Pump Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.plumbing.pantry",
              "label": "Pantry Plumbing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.plumbing.grease_trap",
              "label": "Grease Trap Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.plumbing.water_treatment",
              "label": "Water-Treatment Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "project_wide.fire_life_safety",
          "label": "Fire & Life Safety",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "common.mep_backbone.sprinkler",
              "label": "Sprinkler System Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.fire.fire_alarm",
              "label": "Fire Alarm System Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.fire.panel_interface",
              "label": "Fire Alarm Panel / Landlord Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.fire.system_interfaces",
              "label": "Fire Alarm System Interfaces",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "common.mep_backbone.smoke_extraction",
              "label": "Smoke Extraction System & Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.fire.fire_dampers",
              "label": "Fire Damper Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "common.mep_backbone.fire_hose_cabinet",
              "label": "Fire Hose Cabinet Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.fire.extinguishers",
              "label": "Fire Extinguisher Placement & Certification",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.fire.fire_stopping",
              "label": "Fire Stopping & Penetration Sealing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.fire.gas_suppression",
              "label": "Gas-Suppression System Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.fire.kitchen_suppression",
              "label": "Kitchen Fire-Suppression Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6
            }
          ]
        },
        {
          "id": "project_wide.low_current_ict_security",
          "label": "Low Current / ICT / Security",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "project_wide.low_current.structured_cabling",
              "label": "Structured Data Cabling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.low_current.fiber",
              "label": "Fiber-Optic Cabling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.low_current.network_rack",
              "label": "Network Rack & Passive Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.low_current.wifi",
              "label": "Wi-Fi Infrastructure Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.low_current.cctv",
              "label": "CCTV Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.low_current.access_control",
              "label": "Access-Control Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.low_current.intrusion_alarm",
              "label": "Intrusion-Alarm Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.low_current.intercom",
              "label": "Intercom Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.low_current.pa_music",
              "label": "PA / Background-Music Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.low_current.people_counting",
              "label": "People-Counting / Footfall System",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.low_current.digital_signage_infrastructure",
              "label": "Digital-Signage Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.low_current.time_attendance",
              "label": "Time-Attendance System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.low_current.av_systems",
              "label": "Specialist AV System Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.low_current.network_equipment",
              "label": "Network Equipment Installation & Configuration",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            }
          ]
        },
        {
          "id": "project_wide.refrigeration_food_service",
          "label": "Refrigeration & Food Service",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "project_wide.refrigeration.cold_rooms",
              "label": "Cold-Room Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.refrigeration.freezer_rooms",
              "label": "Freezer-Room Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.refrigeration.system",
              "label": "Refrigeration Plant & Piping",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 9
            },
            {
              "id": "project_wide.refrigeration.display_units",
              "label": "Refrigerated Display Units Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "project_wide.food_service.kitchen_equipment",
              "label": "Kitchen Equipment Installation & Connection",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6
            }
          ]
        },
        {
          "id": "project_wide.external_access_works",
          "label": "External / Access Works",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.external.loading_area",
              "label": "Loading / Receiving Area Works",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "project_wide.external.paving_civil",
              "label": "Retail External & Paving Works",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "project_wide.external.anti_ram",
              "label": "Anti-Ram / Physical-Security Barriers",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "project_wide.external.vertical_transport_interface",
              "label": "Lift / Escalator Interface Works",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "project_wide.commissioning",
          "label": "Commissioning",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "common.commissioning.electrical_final",
              "label": "Electrical Testing & Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.commissioning.emergency_lighting",
              "label": "Emergency-Lighting Test",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.commissioning.hvac_tab",
              "label": "HVAC Testing & Balancing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "common.commissioning.hvac_final",
              "label": "HVAC Final Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "project_wide.commissioning.controls_bms",
              "label": "Controls / BMS Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.commissioning.plumbing",
              "label": "Plumbing Pressure & Functional Testing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "common.commissioning.fire_alarm_test",
              "label": "Fire-Alarm Testing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.commissioning.sprinkler_acceptance",
              "label": "Sprinkler Acceptance Test",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "common.commissioning.smoke_extraction_test",
              "label": "Smoke-Extraction Test",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.commissioning.fhc_acceptance",
              "label": "FHC / Fire-System Acceptance",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.commissioning.low_current",
              "label": "Low-Current Systems Testing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "project_wide.commissioning.access_control",
              "label": "Access-Control Test",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "project_wide.commissioning.cctv",
              "label": "CCTV Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "common.commissioning.integrated_systems_test",
              "label": "Integrated Systems Test",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "project_wide.pre_handover_readiness",
          "label": "Pre-Handover & Readiness",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "common.pre_opening.test_reports",
              "label": "Test Reports & Certificates",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.pre_handover.authority_approvals",
              "label": "Authority Approvals",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.pre_handover.landlord_approval",
              "label": "Landlord Approval",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.pre_handover.final_cleaning",
              "label": "Final Cleaning",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.pre_handover.snagging",
              "label": "Snagging & Punch-List Resolution",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "common.pre_opening.final_walkthrough",
              "label": "Final Readiness Walkthrough",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.pre_handover.training",
              "label": "Staff & System Training",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            }
          ]
        },
        {
          "id": "project_wide.handover_documentation",
          "label": "Handover & Documentation",
          "workPackages": [
            {
              "id": "project_wide.handover.as_built",
              "label": "As-Built Documentation",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "common.handover.snag_closure",
              "label": "Final Snag-Closure Confirmation",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "common.handover.final_inspection",
              "label": "Final Inspection",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "common.handover.acceptance_act",
              "label": "Acceptance & Transfer",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "common.handover.keys_possession",
              "label": "Keys & Possession",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.handover.om_manuals",
              "label": "O&M Manuals",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.handover.warranties",
              "label": "Warranty Package",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "project_wide.handover.asset_handover",
              "label": "Asset Register & Asset Handover",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            }
          ]
        }
      ]
    },
    {
      "id": "sales",
      "label": "Sales Area",
      "areaBasis": "SALES_AREA",
      "defaultWeight": 80,
      "categories": [
        {
          "id": "sales.partitions_doors",
          "label": "Partitions & Doors",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "sales.partitions.metal_framing",
              "label": "Metal Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.partitions.plasterboard",
              "label": "Plasterboard Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.partitions.special",
              "label": "Specialist Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.partitions.acoustic",
              "label": "Acoustic Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.partitions.glass",
              "label": "Glass Partitions & Internal Glazing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.partitions.doors",
              "label": "Internal Doors",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.partitions.fire_doors",
              "label": "Fire-Rated Doors",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.partitions.access_panels",
              "label": "Architectural Access Panels",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            }
          ]
        },
        {
          "id": "sales.ceilings",
          "label": "Ceilings",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "sales.ceilings.framing",
              "label": "Ceiling Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.ceilings.gypsum",
              "label": "Gypsum Ceiling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.ceilings.suspended_grid",
              "label": "Suspended Grid Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.ceilings.open_ceiling",
              "label": "Open-Ceiling Treatment",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.ceilings.acoustic",
              "label": "Acoustic Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.ceilings.feature",
              "label": "Feature Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.finishing.ceiling_final",
              "label": "Ceiling Finishes",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            }
          ]
        },
        {
          "id": "sales.wall_finishes",
          "label": "Wall Finishes",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "sales.wall_finishes.surface_preparation",
              "label": "Wall Surface Preparation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.wall_finishes.painting",
              "label": "Painting",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.wall_finishes.coverings",
              "label": "Wallpaper & Wall Coverings",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.wall_finishes.decorative",
              "label": "Decorative Finishes",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.wall_finishes.panels",
              "label": "Wall Panels",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.wall_finishes.cladding",
              "label": "Internal Wall Cladding",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.wall_finishes.ceramic_tiles",
              "label": "Ceramic Wall Tiles",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.wall_finishes.mirrors",
              "label": "Mirrors Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.wall_finishes.special_coatings",
              "label": "Specialist Wall Coatings",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "sales.flooring",
          "label": "Flooring",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "sales.flooring.tile",
              "label": "Floor Tile Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.flooring.vinyl_lvt",
              "label": "Vinyl & LVT Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.flooring.carpet",
              "label": "Carpet Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.flooring.timber_laminate",
              "label": "Timber & Laminate Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.flooring.resin_epoxy",
              "label": "Resin / Epoxy Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.flooring.polished_concrete",
              "label": "Polished Concrete Flooring",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "sales.flooring.skirting_trims",
              "label": "Skirting & Floor Trims",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2
            }
          ]
        },
        {
          "id": "sales.shopfront_facade",
          "label": "Shopfront & Facade",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "sales.facade.shopfront_framing",
              "label": "Shopfront Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.facade.shopfront_glazing",
              "label": "Shopfront Glazing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.facade.security_glazing",
              "label": "Security Glazing",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "sales.facade.entrance_doors",
              "label": "Entrance Doors",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.facade.automatic_doors",
              "label": "Automatic Entrance Doors",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.facade.security_shutters",
              "label": "Security Shutters",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.facade.cladding_finishes",
              "label": "Facade Cladding & Finishes",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.facade.external_brand_signage",
              "label": "External Brand Signage",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.facade.canopies",
              "label": "Canopies",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.facade.window_display_infrastructure",
              "label": "Window-Display Infrastructure",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            }
          ]
        },
        {
          "id": "sales.furniture_joinery",
          "label": "Furniture & Joinery",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "sales.furniture.wall_fixtures",
              "label": "Wall Fixtures & Perimeter Furniture",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "sales.furniture.freestanding",
              "label": "Freestanding Fixtures & Gondolas",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "sales.furniture.display_shelving",
              "label": "Display Units & Shelving",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "sales.furniture.fitting_rooms",
              "label": "Fitting Rooms",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "sales.furniture.cash_desk",
              "label": "Cash Desk",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.furniture.service_desk",
              "label": "Service Desk",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.furniture.specialist_joinery",
              "label": "Specialist Joinery",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 8
            }
          ]
        },
        {
          "id": "sales.retail_technology",
          "label": "Retail Technology Installation",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "sales.retail_technology.eas_gates",
              "label": "EAS Gates Installation & Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.retail_technology.pos",
              "label": "POS Equipment Installation & Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.retail_technology.self_checkout",
              "label": "Self-Checkout Installation & Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.retail_technology.digital_screens",
              "label": "Digital Screens Installation & Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.retail_technology.interactive_displays",
              "label": "Interactive Displays Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.retail_technology.esl",
              "label": "Electronic Shelf-Label Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "sales.retail_technology.queue_management",
              "label": "Queue-Management System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.retail_technology.click_collect",
              "label": "Click-and-Collect / Smart-Locker Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.retail_technology.charging",
              "label": "Customer Charging Equipment",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 2
            }
          ]
        },
        {
          "id": "sales.signage_graphics",
          "label": "Signage & Graphics",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "sales.signage.internal_brand",
              "label": "Internal Brand Signage",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.signage.wayfinding",
              "label": "Wayfinding Signage",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "sales.signage.regulatory_safety",
              "label": "Regulatory & Safety Signage",
              "catalogClass": "core",
              "constructionProgressEligible": false
            },
            {
              "id": "sales.signage.window_graphics",
              "label": "Window Graphics",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.signage.wall_graphics",
              "label": "Wall Graphics",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "sales.signage.menu_boards",
              "label": "Menu Boards",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "sales.signage.price_category",
              "label": "Price / Category Signage Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            }
          ]
        }
      ]
    },
    {
      "id": "boh",
      "label": "Back of House",
      "areaBasis": "BOH_AREA",
      "defaultWeight": 20,
      "categories": [
        {
          "id": "boh.partitions_doors",
          "label": "Partitions & Doors",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.partitions.metal_framing",
              "label": "Metal Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.partitions.plasterboard",
              "label": "Plasterboard Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.partitions.special",
              "label": "Specialist Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.partitions.acoustic",
              "label": "Acoustic Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.partitions.doors",
              "label": "Internal Doors",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "boh.partitions.fire_doors",
              "label": "Fire-Rated Doors",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.partitions.access_panels",
              "label": "Architectural Access Panels",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2
            }
          ]
        },
        {
          "id": "boh.ceilings",
          "label": "Ceilings",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.ceilings.framing",
              "label": "Ceiling Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.ceilings.gypsum",
              "label": "Gypsum Ceiling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.ceilings.suspended_grid",
              "label": "Suspended Grid Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.ceilings.open_ceiling",
              "label": "Open-Ceiling Treatment",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.ceilings.acoustic",
              "label": "Acoustic Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.finishing.ceiling_final",
              "label": "Ceiling Finishes",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            }
          ]
        },
        {
          "id": "boh.wall_finishes",
          "label": "Wall Finishes",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "boh.wall_finishes.surface_preparation",
              "label": "Wall Surface Preparation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2
            },
            {
              "id": "boh.wall_finishes.painting",
              "label": "Painting",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.wall_finishes.coverings",
              "label": "Wall Coverings",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.wall_finishes.decorative",
              "label": "Decorative Finishes",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.wall_finishes.panels",
              "label": "Wall Panels & Cladding",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.wall_finishes.ceramic_tiles",
              "label": "Ceramic Wall Tiles",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.wall_finishes.special_coatings",
              "label": "Specialist Wall Coatings",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5
            }
          ]
        },
        {
          "id": "boh.flooring",
          "label": "Flooring",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.flooring.tile",
              "label": "Floor Tile Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "boh.flooring.vinyl_lvt",
              "label": "Vinyl & LVT Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.flooring.carpet",
              "label": "Carpet Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.flooring.timber_laminate",
              "label": "Timber & Laminate Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.flooring.resin_epoxy",
              "label": "Resin / Epoxy Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6
            },
            {
              "id": "boh.flooring.polished_concrete",
              "label": "Polished Concrete Flooring",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7
            },
            {
              "id": "boh.flooring.skirting_trims",
              "label": "Skirting & Floor Trims",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2
            }
          ]
        },
        {
          "id": "boh.furniture_storage",
          "label": "Furniture & Storage",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "boh.furniture.stockroom_shelving",
              "label": "Stockroom Shelving & Racking",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 8
            },
            {
              "id": "boh.furniture.storage_cabinets",
              "label": "Storage Cabinets",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5
            },
            {
              "id": "boh.furniture.lockers",
              "label": "Lockers",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "boh.furniture.pantry",
              "label": "Pantry Furniture",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "boh.furniture.office",
              "label": "Office Furniture",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3
            },
            {
              "id": "boh.furniture.workstations",
              "label": "Workstations & Service Counters",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            }
          ]
        },
        {
          "id": "boh.back_office_staff_equipment",
          "label": "Back Office & Staff Equipment",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.equipment.it_equipment",
              "label": "Back-Office IT Equipment Setup",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            },
            {
              "id": "boh.equipment.printers",
              "label": "Printer & Peripheral Deployment",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            },
            {
              "id": "boh.equipment.office_devices",
              "label": "Office-Device Deployment",
              "catalogClass": "optional",
              "constructionProgressEligible": false
            },
            {
              "id": "boh.equipment.pantry",
              "label": "Pantry Equipment Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            },
            {
              "id": "boh.equipment.staff_facilities",
              "label": "Staff-Facility Equipment Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4
            }
          ]
        }
      ]
    }
  ],
  "dependencies": [],
  "defaultScope": {
    "workPackageIds": [
      "project_wide.preparation.project_setting_out",
      "project_wide.builders_works.openings_penetrations",
      "project_wide.builders_works.mep_builders_works",
      "project_wide.substrates.floor_preparation",
      "common.floor_prep.screed",
      "project_wide.electrical.distribution_panels",
      "project_wide.electrical.containment",
      "project_wide.electrical.power_cabling",
      "project_wide.electrical.small_power",
      "project_wide.electrical.lighting_wiring",
      "project_wide.electrical.general_lighting",
      "project_wide.electrical.emergency_lighting",
      "project_wide.electrical.earthing_bonding",
      "project_wide.hvac.ductwork",
      "project_wide.hvac.air_distribution",
      "common.mep_backbone.hvac_controls",
      "common.mep_backbone.sprinkler",
      "project_wide.fire.fire_alarm",
      "project_wide.fire.extinguishers",
      "project_wide.fire.fire_stopping",
      "project_wide.low_current.structured_cabling",
      "project_wide.low_current.cctv",
      "project_wide.low_current.access_control",
      "common.commissioning.electrical_final",
      "project_wide.commissioning.emergency_lighting",
      "project_wide.commissioning.hvac_tab",
      "common.commissioning.hvac_final",
      "common.commissioning.fire_alarm_test",
      "project_wide.commissioning.sprinkler_acceptance",
      "common.commissioning.integrated_systems_test",
      "common.pre_opening.test_reports",
      "project_wide.pre_handover.final_cleaning",
      "project_wide.pre_handover.snagging",
      "common.pre_opening.final_walkthrough",
      "project_wide.handover.as_built",
      "common.handover.snag_closure",
      "common.handover.final_inspection",
      "common.handover.acceptance_act",
      "common.handover.keys_possession",
      "project_wide.handover.om_manuals",
      "project_wide.handover.warranties",
      "sales.partitions.metal_framing",
      "sales.partitions.plasterboard",
      "sales.partitions.doors",
      "sales.ceilings.framing",
      "sales.ceilings.gypsum",
      "sales.finishing.ceiling_final",
      "sales.wall_finishes.surface_preparation",
      "sales.wall_finishes.painting",
      "sales.flooring.tile",
      "sales.flooring.skirting_trims",
      "sales.facade.shopfront_framing",
      "sales.facade.shopfront_glazing",
      "sales.facade.entrance_doors",
      "sales.facade.external_brand_signage",
      "sales.facade.window_display_infrastructure",
      "sales.furniture.wall_fixtures",
      "sales.furniture.freestanding",
      "sales.furniture.display_shelving",
      "sales.furniture.fitting_rooms",
      "sales.furniture.cash_desk",
      "sales.retail_technology.eas_gates",
      "sales.retail_technology.pos",
      "sales.signage.internal_brand",
      "sales.signage.regulatory_safety",
      "boh.partitions.metal_framing",
      "boh.partitions.plasterboard",
      "boh.partitions.doors",
      "boh.ceilings.framing",
      "boh.ceilings.gypsum",
      "boh.finishing.ceiling_final",
      "boh.wall_finishes.surface_preparation",
      "boh.wall_finishes.painting",
      "boh.flooring.tile",
      "boh.flooring.skirting_trims",
      "boh.furniture.stockroom_shelving",
      "boh.furniture.storage_cabinets",
      "boh.furniture.lockers"
    ]
  }
}
$pre_duration$::jsonb THEN
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_PRECONDITION_MISMATCH'
      USING ERRCODE = '23514',
            DETAIL = 'Expected the exact frozen weighted pre-duration candidate.';
  END IF;

  UPDATE public.templates
     SET data = $duration_catalog$
{
  "schemaVersion": 2,
  "model": "zoned",
  "templateType": "retail-fitout-v2",
  "label": "Retail Fit-Out (Master Catalog)",
  "zones": [
    {
      "id": "project_wide",
      "label": "Project-Wide Works",
      "areaBasis": "NONE",
      "anchorPct": 40,
      "categories": [
        {
          "id": "project_wide.preparation_demolition",
          "label": "Preparation & Demolition",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.preparation.project_setting_out",
              "label": "Project Setting Out",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.preparation.existing_area_protection",
              "label": "Existing-Area Protection & Hoarding",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "common.demolition.strip_out",
              "label": "Strip Out & Clearance",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "common.demolition.structural",
              "label": "Structural Demolition",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            },
            {
              "id": "common.demolition.mep_disconnect",
              "label": "MEP Isolation & Disconnection",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            }
          ]
        },
        {
          "id": "project_wide.builders_works_substrates",
          "label": "Builders' Works & Substrates",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.builders_works.openings_penetrations",
              "label": "Builder's Openings & Penetrations",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.builders_works.core_drilling",
              "label": "Core Drilling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.builders_works.structural_supports",
              "label": "Structural Supports & Reinforcements",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.builders_works.slab_repairs",
              "label": "Slab Repairs",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.builders_works.mep_builders_works",
              "label": "Builder's Works Associated with MEP",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.substrates.floor_preparation",
              "label": "Floor Substrate Preparation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "common.floor_prep.screed",
              "label": "Screeding & Self-Levelling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.substrates.waterproofing",
              "label": "Waterproofing Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.substrates.raised_access_floor",
              "label": "Raised Access Floor Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.builders_works.equipment_supports",
              "label": "Equipment Supports & Access Platforms",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            }
          ]
        },
        {
          "id": "project_wide.electrical",
          "label": "Electrical",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "project_wide.electrical.incoming_supply_interface",
              "label": "Incoming Supply & Landlord Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.electrical.distribution_panels",
              "label": "Main & Sub-Distribution Panels",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.electrical.containment",
              "label": "Electrical Containment & Cable Trays",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.power_cabling",
              "label": "Power Cabling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.small_power",
              "label": "Small Power, Sockets & Floor Boxes",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.lighting_wiring",
              "label": "Lighting Power & Control Wiring",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.general_lighting",
              "label": "General Lighting Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.feature_lighting",
              "label": "Feature & Decorative Lighting",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "project_wide.electrical.emergency_lighting",
              "label": "Emergency Lighting & Exit Signs",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.lighting_controls",
              "label": "Lighting Controls & Dimming",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.electrical.earthing_bonding",
              "label": "Earthing & Bonding",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.electrical.metering",
              "label": "Electrical Metering",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.electrical.ups",
              "label": "UPS Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.electrical.generator_ats",
              "label": "Generator & ATS Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 9,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.electrical.busbar",
              "label": "Busbar Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.electrical.power_quality",
              "label": "Power Quality / Power-Factor Equipment",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        },
        {
          "id": "project_wide.hvac",
          "label": "HVAC",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "project_wide.hvac.landlord_interface",
              "label": "Landlord HVAC Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.hvac.fcu_installation",
              "label": "FCU Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "project_wide.hvac.ahu_installation",
              "label": "AHU Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.hvac.vrf_vrv",
              "label": "VRF / VRV System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            },
            {
              "id": "project_wide.hvac.split_systems",
              "label": "Split AC System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.hvac.chilled_water_interface",
              "label": "Chilled-Water Interface & Piping",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "project_wide.hvac.refrigerant_piping",
              "label": "Refrigerant Piping",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.hvac.condensate_drainage",
              "label": "HVAC Condensate Drainage",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.hvac.ductwork",
              "label": "HVAC Ductwork",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 12,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.hvac.air_distribution",
              "label": "Grilles & Diffusers",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.hvac.air_curtains",
              "label": "Air Curtain Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.hvac.ventilation_extract",
              "label": "Ventilation & Extract Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.hvac.special_exhaust",
              "label": "Kitchen / Specialist Exhaust",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            },
            {
              "id": "common.mep_backbone.hvac_controls",
              "label": "HVAC Controls Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.hvac.bms_integration",
              "label": "BMS Integration",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.hvac.server_room_cooling",
              "label": "Server-Room Cooling",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        },
        {
          "id": "project_wide.plumbing_drainage",
          "label": "Plumbing & Drainage",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.plumbing.cold_water",
              "label": "Cold-Water Supply",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.plumbing.hot_water",
              "label": "Hot-Water Supply & Water Heater",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.plumbing.drainage",
              "label": "Drainage & Wastewater",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.plumbing.sanitary",
              "label": "Sanitary Fixtures & Connections",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "project_wide.plumbing.floor_drains",
              "label": "Floor Drains",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.plumbing.special_pumps",
              "label": "Booster / Sump Pump Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.plumbing.pantry",
              "label": "Pantry Plumbing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.plumbing.grease_trap",
              "label": "Grease Trap Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.plumbing.water_treatment",
              "label": "Water-Treatment Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            }
          ]
        },
        {
          "id": "project_wide.fire_life_safety",
          "label": "Fire & Life Safety",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "common.mep_backbone.sprinkler",
              "label": "Sprinkler System Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.fire.fire_alarm",
              "label": "Fire Alarm System Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.fire.panel_interface",
              "label": "Fire Alarm Panel / Landlord Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.fire.system_interfaces",
              "label": "Fire Alarm System Interfaces",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "common.mep_backbone.smoke_extraction",
              "label": "Smoke Extraction System & Interface",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.fire.fire_dampers",
              "label": "Fire Damper Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "common.mep_backbone.fire_hose_cabinet",
              "label": "Fire Hose Cabinet Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.fire.extinguishers",
              "label": "Fire Extinguisher Placement & Certification",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.fire.fire_stopping",
              "label": "Fire Stopping & Penetration Sealing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.fire.gas_suppression",
              "label": "Gas-Suppression System Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.fire.kitchen_suppression",
              "label": "Kitchen Fire-Suppression Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            }
          ]
        },
        {
          "id": "project_wide.low_current_ict_security",
          "label": "Low Current / ICT / Security",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "project_wide.low_current.structured_cabling",
              "label": "Structured Data Cabling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 9,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.low_current.fiber",
              "label": "Fiber-Optic Cabling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.low_current.network_rack",
              "label": "Network Rack & Passive Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.low_current.wifi",
              "label": "Wi-Fi Infrastructure Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.low_current.cctv",
              "label": "CCTV Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.low_current.access_control",
              "label": "Access-Control Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "project_wide.low_current.intrusion_alarm",
              "label": "Intrusion-Alarm Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "project_wide.low_current.intercom",
              "label": "Intercom Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.low_current.pa_music",
              "label": "PA / Background-Music Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.low_current.people_counting",
              "label": "People-Counting / Footfall System",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.low_current.digital_signage_infrastructure",
              "label": "Digital-Signage Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.low_current.time_attendance",
              "label": "Time-Attendance System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.low_current.av_systems",
              "label": "Specialist AV System Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.low_current.network_equipment",
              "label": "Network Equipment Installation & Configuration",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        },
        {
          "id": "project_wide.refrigeration_food_service",
          "label": "Refrigeration & Food Service",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "project_wide.refrigeration.cold_rooms",
              "label": "Cold-Room Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.refrigeration.freezer_rooms",
              "label": "Freezer-Room Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.refrigeration.system",
              "label": "Refrigeration Plant & Piping",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 9,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            },
            {
              "id": "project_wide.refrigeration.display_units",
              "label": "Refrigerated Display Units Installation",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.food_service.kitchen_equipment",
              "label": "Kitchen Equipment Installation & Connection",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            }
          ]
        },
        {
          "id": "project_wide.external_access_works",
          "label": "External / Access Works",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "project_wide.external.loading_area",
              "label": "Loading / Receiving Area Works",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "project_wide.external.paving_civil",
              "label": "Retail External & Paving Works",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 12
              }
            },
            {
              "id": "project_wide.external.anti_ram",
              "label": "Anti-Ram / Physical-Security Barriers",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "project_wide.external.vertical_transport_interface",
              "label": "Lift / Escalator Interface Works",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            }
          ]
        },
        {
          "id": "project_wide.commissioning",
          "label": "Commissioning",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "common.commissioning.electrical_final",
              "label": "Electrical Testing & Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.commissioning.emergency_lighting",
              "label": "Emergency-Lighting Test",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 1
              }
            },
            {
              "id": "project_wide.commissioning.hvac_tab",
              "label": "HVAC Testing & Balancing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "common.commissioning.hvac_final",
              "label": "HVAC Final Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.commissioning.controls_bms",
              "label": "Controls / BMS Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.commissioning.plumbing",
              "label": "Plumbing Pressure & Functional Testing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "common.commissioning.fire_alarm_test",
              "label": "Fire-Alarm Testing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.commissioning.sprinkler_acceptance",
              "label": "Sprinkler Acceptance Test",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "common.commissioning.smoke_extraction_test",
              "label": "Smoke-Extraction Test",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "project_wide.commissioning.fhc_acceptance",
              "label": "FHC / Fire-System Acceptance",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 1
              }
            },
            {
              "id": "project_wide.commissioning.low_current",
              "label": "Low-Current Systems Testing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "project_wide.commissioning.access_control",
              "label": "Access-Control Test",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 1
              }
            },
            {
              "id": "project_wide.commissioning.cctv",
              "label": "CCTV Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "common.commissioning.integrated_systems_test",
              "label": "Integrated Systems Test",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        },
        {
          "id": "project_wide.pre_handover_readiness",
          "label": "Pre-Handover & Readiness",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "common.pre_opening.test_reports",
              "label": "Test Reports & Certificates",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "EXCLUDED"
              }
            },
            {
              "id": "project_wide.pre_handover.authority_approvals",
              "label": "Authority Approvals",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "project_wide.pre_handover.landlord_approval",
              "label": "Landlord Approval",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "project_wide.pre_handover.final_cleaning",
              "label": "Final Cleaning",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "project_wide.pre_handover.snagging",
              "label": "Snagging & Punch-List Resolution",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "TOTAL_AREA"
              }
            },
            {
              "id": "common.pre_opening.final_walkthrough",
              "label": "Final Readiness Walkthrough",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "project_wide.pre_handover.training",
              "label": "Staff & System Training",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            }
          ]
        },
        {
          "id": "project_wide.handover_documentation",
          "label": "Handover & Documentation",
          "workPackages": [
            {
              "id": "project_wide.handover.as_built",
              "label": "As-Built Documentation",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "EXCLUDED"
              }
            },
            {
              "id": "common.handover.snag_closure",
              "label": "Final Snag-Closure Confirmation",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "common.handover.final_inspection",
              "label": "Final Inspection",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "common.handover.acceptance_act",
              "label": "Acceptance & Transfer",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "common.handover.keys_possession",
              "label": "Keys & Possession",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "MILESTONE"
              }
            },
            {
              "id": "project_wide.handover.om_manuals",
              "label": "O&M Manuals",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "EXCLUDED"
              }
            },
            {
              "id": "project_wide.handover.warranties",
              "label": "Warranty Package",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "EXCLUDED"
              }
            },
            {
              "id": "project_wide.handover.asset_handover",
              "label": "Asset Register & Asset Handover",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "EXCLUDED"
              }
            }
          ]
        }
      ]
    },
    {
      "id": "sales",
      "label": "Sales Area",
      "areaBasis": "SALES_AREA",
      "defaultWeight": 80,
      "categories": [
        {
          "id": "sales.partitions_doors",
          "label": "Partitions & Doors",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "sales.partitions.metal_framing",
              "label": "Metal Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.partitions.plasterboard",
              "label": "Plasterboard Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.partitions.special",
              "label": "Specialist Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "sales.partitions.acoustic",
              "label": "Acoustic Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.partitions.glass",
              "label": "Glass Partitions & Internal Glazing",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "sales.partitions.doors",
              "label": "Internal Doors",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "sales.partitions.fire_doors",
              "label": "Fire-Rated Doors",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "sales.partitions.access_panels",
              "label": "Architectural Access Panels",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            }
          ]
        },
        {
          "id": "sales.ceilings",
          "label": "Ceilings",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "sales.ceilings.framing",
              "label": "Ceiling Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.ceilings.gypsum",
              "label": "Gypsum Ceiling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.ceilings.suspended_grid",
              "label": "Suspended Grid Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.ceilings.open_ceiling",
              "label": "Open-Ceiling Treatment",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.ceilings.acoustic",
              "label": "Acoustic Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 9,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.ceilings.feature",
              "label": "Feature Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.finishing.ceiling_final",
              "label": "Ceiling Finishes",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "SALES_AREA"
              }
            }
          ]
        },
        {
          "id": "sales.wall_finishes",
          "label": "Wall Finishes",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "sales.wall_finishes.surface_preparation",
              "label": "Wall Surface Preparation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.wall_finishes.painting",
              "label": "Painting",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.wall_finishes.coverings",
              "label": "Wallpaper & Wall Coverings",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.wall_finishes.decorative",
              "label": "Decorative Finishes",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.wall_finishes.panels",
              "label": "Wall Panels",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            },
            {
              "id": "sales.wall_finishes.cladding",
              "label": "Internal Wall Cladding",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            },
            {
              "id": "sales.wall_finishes.ceramic_tiles",
              "label": "Ceramic Wall Tiles",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "sales.wall_finishes.mirrors",
              "label": "Mirrors Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.wall_finishes.special_coatings",
              "label": "Specialist Wall Coatings",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            }
          ]
        },
        {
          "id": "sales.flooring",
          "label": "Flooring",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "sales.flooring.tile",
              "label": "Floor Tile Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 12,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.flooring.vinyl_lvt",
              "label": "Vinyl & LVT Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 9,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.flooring.carpet",
              "label": "Carpet Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.flooring.timber_laminate",
              "label": "Timber & Laminate Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.flooring.resin_epoxy",
              "label": "Resin / Epoxy Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.flooring.polished_concrete",
              "label": "Polished Concrete Flooring",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 12,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.flooring.skirting_trims",
              "label": "Skirting & Floor Trims",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "SALES_AREA"
              }
            }
          ]
        },
        {
          "id": "sales.shopfront_facade",
          "label": "Shopfront & Facade",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "sales.facade.shopfront_framing",
              "label": "Shopfront Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "sales.facade.shopfront_glazing",
              "label": "Shopfront Glazing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "sales.facade.security_glazing",
              "label": "Security Glazing",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "sales.facade.entrance_doors",
              "label": "Entrance Doors",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.facade.automatic_doors",
              "label": "Automatic Entrance Doors",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "sales.facade.security_shutters",
              "label": "Security Shutters",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "sales.facade.cladding_finishes",
              "label": "Facade Cladding & Finishes",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 8
              }
            },
            {
              "id": "sales.facade.external_brand_signage",
              "label": "External Brand Signage",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.facade.canopies",
              "label": "Canopies",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "sales.facade.window_display_infrastructure",
              "label": "Window-Display Infrastructure",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        },
        {
          "id": "sales.furniture_joinery",
          "label": "Furniture & Joinery",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "sales.furniture.wall_fixtures",
              "label": "Wall Fixtures & Perimeter Furniture",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 10,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.furniture.freestanding",
              "label": "Freestanding Fixtures & Gondolas",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.furniture.display_shelving",
              "label": "Display Units & Shelving",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 9,
                "areaBasis": "SALES_AREA"
              }
            },
            {
              "id": "sales.furniture.fitting_rooms",
              "label": "Fitting Rooms",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 7
              }
            },
            {
              "id": "sales.furniture.cash_desk",
              "label": "Cash Desk",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.furniture.service_desk",
              "label": "Service Desk",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.furniture.specialist_joinery",
              "label": "Specialist Joinery",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 10
              }
            }
          ]
        },
        {
          "id": "sales.retail_technology",
          "label": "Retail Technology Installation",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "sales.retail_technology.eas_gates",
              "label": "EAS Gates Installation & Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.retail_technology.pos",
              "label": "POS Equipment Installation & Commissioning",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.retail_technology.self_checkout",
              "label": "Self-Checkout Installation & Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "sales.retail_technology.digital_screens",
              "label": "Digital Screens Installation & Commissioning",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.retail_technology.interactive_displays",
              "label": "Interactive Displays Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.retail_technology.esl",
              "label": "Electronic Shelf-Label Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "sales.retail_technology.queue_management",
              "label": "Queue-Management System Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.retail_technology.click_collect",
              "label": "Click-and-Collect / Smart-Locker Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.retail_technology.charging",
              "label": "Customer Charging Equipment",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            }
          ]
        },
        {
          "id": "sales.signage_graphics",
          "label": "Signage & Graphics",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "sales.signage.internal_brand",
              "label": "Internal Brand Signage",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "sales.signage.wayfinding",
              "label": "Wayfinding Signage",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.signage.regulatory_safety",
              "label": "Regulatory & Safety Signage",
              "catalogClass": "core",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "sales.signage.window_graphics",
              "label": "Window Graphics",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "sales.signage.wall_graphics",
              "label": "Wall Graphics",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "sales.signage.menu_boards",
              "label": "Menu Boards",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "sales.signage.price_category",
              "label": "Price / Category Signage Infrastructure",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        }
      ]
    },
    {
      "id": "boh",
      "label": "Back of House",
      "areaBasis": "BOH_AREA",
      "defaultWeight": 20,
      "categories": [
        {
          "id": "boh.partitions_doors",
          "label": "Partitions & Doors",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.partitions.metal_framing",
              "label": "Metal Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.partitions.plasterboard",
              "label": "Plasterboard Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.partitions.special",
              "label": "Specialist Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "boh.partitions.acoustic",
              "label": "Acoustic Partitions",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.partitions.doors",
              "label": "Internal Doors",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "boh.partitions.fire_doors",
              "label": "Fire-Rated Doors",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "boh.partitions.access_panels",
              "label": "Architectural Access Panels",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            }
          ]
        },
        {
          "id": "boh.ceilings",
          "label": "Ceilings",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.ceilings.framing",
              "label": "Ceiling Framing",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.ceilings.gypsum",
              "label": "Gypsum Ceiling",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.ceilings.suspended_grid",
              "label": "Suspended Grid Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.ceilings.open_ceiling",
              "label": "Open-Ceiling Treatment",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.ceilings.acoustic",
              "label": "Acoustic Ceiling",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.finishing.ceiling_final",
              "label": "Ceiling Finishes",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "BOH_AREA"
              }
            }
          ]
        },
        {
          "id": "boh.wall_finishes",
          "label": "Wall Finishes",
          "categoryFactor": 0.75,
          "workPackages": [
            {
              "id": "boh.wall_finishes.surface_preparation",
              "label": "Wall Surface Preparation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.wall_finishes.painting",
              "label": "Painting",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.wall_finishes.coverings",
              "label": "Wall Coverings",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.wall_finishes.decorative",
              "label": "Decorative Finishes",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "boh.wall_finishes.panels",
              "label": "Wall Panels & Cladding",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "boh.wall_finishes.ceramic_tiles",
              "label": "Ceramic Wall Tiles",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 6
              }
            },
            {
              "id": "boh.wall_finishes.special_coatings",
              "label": "Specialist Wall Coatings",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            }
          ]
        },
        {
          "id": "boh.flooring",
          "label": "Flooring",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.flooring.tile",
              "label": "Floor Tile Installation",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.flooring.vinyl_lvt",
              "label": "Vinyl & LVT Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 5,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.flooring.carpet",
              "label": "Carpet Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 4,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.flooring.timber_laminate",
              "label": "Timber & Laminate Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 6,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.flooring.resin_epoxy",
              "label": "Resin / Epoxy Flooring",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 6,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.flooring.polished_concrete",
              "label": "Polished Concrete Flooring",
              "catalogClass": "specialized",
              "constructionProgressEligible": true,
              "baseEffort": 7,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 8,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.flooring.skirting_trims",
              "label": "Skirting & Floor Trims",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 2,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 3,
                "areaBasis": "BOH_AREA"
              }
            }
          ]
        },
        {
          "id": "boh.furniture_storage",
          "label": "Furniture & Storage",
          "categoryFactor": 1.25,
          "workPackages": [
            {
              "id": "boh.furniture.stockroom_shelving",
              "label": "Stockroom Shelving & Racking",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 8,
              "duration": {
                "mode": "AREA_SCALED",
                "baseDurationDays": 7,
                "areaBasis": "BOH_AREA"
              }
            },
            {
              "id": "boh.furniture.storage_cabinets",
              "label": "Storage Cabinets",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 5,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 5
              }
            },
            {
              "id": "boh.furniture.lockers",
              "label": "Lockers",
              "catalogClass": "core",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            },
            {
              "id": "boh.furniture.pantry",
              "label": "Pantry Furniture",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "boh.furniture.office",
              "label": "Office Furniture",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 3,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "boh.furniture.workstations",
              "label": "Workstations & Service Counters",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 4
              }
            }
          ]
        },
        {
          "id": "boh.back_office_staff_equipment",
          "label": "Back Office & Staff Equipment",
          "categoryFactor": 1,
          "workPackages": [
            {
              "id": "boh.equipment.it_equipment",
              "label": "Back-Office IT Equipment Setup",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 2
              }
            },
            {
              "id": "boh.equipment.printers",
              "label": "Printer & Peripheral Deployment",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 1
              }
            },
            {
              "id": "boh.equipment.office_devices",
              "label": "Office-Device Deployment",
              "catalogClass": "optional",
              "constructionProgressEligible": false,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 1
              }
            },
            {
              "id": "boh.equipment.pantry",
              "label": "Pantry Equipment Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            },
            {
              "id": "boh.equipment.staff_facilities",
              "label": "Staff-Facility Equipment Installation",
              "catalogClass": "optional",
              "constructionProgressEligible": true,
              "baseEffort": 4,
              "duration": {
                "mode": "FIXED",
                "baseDurationDays": 3
              }
            }
          ]
        }
      ]
    }
  ],
  "durationModel": {
    "version": 1,
    "unit": "PROJECT_WORKING_DAY",
    "calendarProfile": "RETAIL_7_DAY",
    "referenceAreas": {
      "TOTAL_AREA": 950,
      "SALES_AREA": 800,
      "BOH_AREA": 150
    },
    "bands": [
      {
        "maxRatio": 0.4,
        "multiplier": 0.7
      },
      {
        "maxRatio": 0.75,
        "multiplier": 0.85
      },
      {
        "maxRatio": 1.5,
        "multiplier": 1
      },
      {
        "maxRatio": 2.5,
        "multiplier": 1.15
      },
      {
        "maxRatio": null,
        "multiplier": 1.3
      }
    ]
  },
  "dependencies": [],
  "defaultScope": {
    "workPackageIds": [
      "project_wide.preparation.project_setting_out",
      "project_wide.builders_works.openings_penetrations",
      "project_wide.builders_works.mep_builders_works",
      "project_wide.substrates.floor_preparation",
      "common.floor_prep.screed",
      "project_wide.electrical.distribution_panels",
      "project_wide.electrical.containment",
      "project_wide.electrical.power_cabling",
      "project_wide.electrical.small_power",
      "project_wide.electrical.lighting_wiring",
      "project_wide.electrical.general_lighting",
      "project_wide.electrical.emergency_lighting",
      "project_wide.electrical.earthing_bonding",
      "project_wide.hvac.ductwork",
      "project_wide.hvac.air_distribution",
      "common.mep_backbone.hvac_controls",
      "common.mep_backbone.sprinkler",
      "project_wide.fire.fire_alarm",
      "project_wide.fire.extinguishers",
      "project_wide.fire.fire_stopping",
      "project_wide.low_current.structured_cabling",
      "project_wide.low_current.cctv",
      "project_wide.low_current.access_control",
      "common.commissioning.electrical_final",
      "project_wide.commissioning.emergency_lighting",
      "project_wide.commissioning.hvac_tab",
      "common.commissioning.hvac_final",
      "common.commissioning.fire_alarm_test",
      "project_wide.commissioning.sprinkler_acceptance",
      "common.commissioning.integrated_systems_test",
      "common.pre_opening.test_reports",
      "project_wide.pre_handover.final_cleaning",
      "project_wide.pre_handover.snagging",
      "common.pre_opening.final_walkthrough",
      "project_wide.handover.as_built",
      "common.handover.snag_closure",
      "common.handover.final_inspection",
      "common.handover.acceptance_act",
      "common.handover.keys_possession",
      "project_wide.handover.om_manuals",
      "project_wide.handover.warranties",
      "sales.partitions.metal_framing",
      "sales.partitions.plasterboard",
      "sales.partitions.doors",
      "sales.ceilings.framing",
      "sales.ceilings.gypsum",
      "sales.finishing.ceiling_final",
      "sales.wall_finishes.surface_preparation",
      "sales.wall_finishes.painting",
      "sales.flooring.tile",
      "sales.flooring.skirting_trims",
      "sales.facade.shopfront_framing",
      "sales.facade.shopfront_glazing",
      "sales.facade.entrance_doors",
      "sales.facade.external_brand_signage",
      "sales.facade.window_display_infrastructure",
      "sales.furniture.wall_fixtures",
      "sales.furniture.freestanding",
      "sales.furniture.display_shelving",
      "sales.furniture.fitting_rooms",
      "sales.furniture.cash_desk",
      "sales.retail_technology.eas_gates",
      "sales.retail_technology.pos",
      "sales.signage.internal_brand",
      "sales.signage.regulatory_safety",
      "boh.partitions.metal_framing",
      "boh.partitions.plasterboard",
      "boh.partitions.doors",
      "boh.ceilings.framing",
      "boh.ceilings.gypsum",
      "boh.finishing.ceiling_final",
      "boh.wall_finishes.surface_preparation",
      "boh.wall_finishes.painting",
      "boh.flooring.tile",
      "boh.flooring.skirting_trims",
      "boh.furniture.stockroom_shelving",
      "boh.furniture.storage_cabinets",
      "boh.furniture.lockers"
    ]
  }
}
$duration_catalog$::jsonb
   WHERE id = 'e4ef4d98-5688-4d12-9fca-2d7cded88d29';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'MASTER_CATALOG_DURATION_UPDATE_COUNT_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
END
$migration$;

COMMIT;
