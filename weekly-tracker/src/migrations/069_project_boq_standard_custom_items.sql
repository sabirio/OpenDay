-- 069_project_boq_standard_custom_items.sql
-- Roadmap Phase C.13: stable STANDARD/CUSTOM BOQ item lifecycle.
-- Native editor ownership and bidder access remain Phase D concerns.

CREATE TABLE IF NOT EXISTS public.project_boq_item_identities (
  boq_id uuid NOT NULL,
  line_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('STANDARD', 'CUSTOM')),
  standard_definition_id uuid,
  first_seen_version_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (boq_id, line_id),
  FOREIGN KEY (boq_id, project_id, ontology_version_id)
    REFERENCES public.project_boqs(id, project_id, ontology_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (first_seen_version_id, boq_id, project_id, ontology_version_id)
    REFERENCES public.project_boq_versions(id, boq_id, project_id, ontology_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, standard_definition_id, work_group_id)
    REFERENCES public.work_ontology_boq_item_definitions(ontology_version_id, id, work_group_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_boq_item_identities_kind_shape_check CHECK (
    (item_kind = 'STANDARD' AND standard_definition_id IS NOT NULL)
    OR (item_kind = 'CUSTOM' AND standard_definition_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS project_boq_item_identities_project_idx
  ON public.project_boq_item_identities(project_id, boq_id);

INSERT INTO public.project_boq_item_identities(
  boq_id, line_id, project_id, ontology_version_id, work_group_id,
  item_kind, standard_definition_id, first_seen_version_id
)
SELECT DISTINCT ON (item.boq_id, item.line_id)
  item.boq_id,
  item.line_id,
  item.project_id,
  item.ontology_version_id,
  item.work_group_id,
  item.item_kind,
  item.standard_definition_id,
  item.boq_version_id
FROM public.project_boq_items item
JOIN public.project_boq_versions version ON version.id = item.boq_version_id
ORDER BY item.boq_id, item.line_id, version.revision_number, item.boq_version_id
ON CONFLICT (boq_id, line_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_boq_items item
    JOIN public.project_boq_item_identities identity
      ON identity.boq_id = item.boq_id AND identity.line_id = item.line_id
    WHERE identity.project_id IS DISTINCT FROM item.project_id
       OR identity.ontology_version_id IS DISTINCT FROM item.ontology_version_id
       OR identity.work_group_id IS DISTINCT FROM item.work_group_id
       OR identity.item_kind IS DISTINCT FROM item.item_kind
       OR identity.standard_definition_id IS DISTINCT FROM item.standard_definition_id
  ) THEN
    RAISE EXCEPTION 'PROJECT_BOQ_LINE_IDENTITY_HISTORY_CONFLICT'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_project_boq_item_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  existing_identity public.project_boq_item_identities%ROWTYPE;
  standard_definition public.work_ontology_boq_item_definitions%ROWTYPE;
BEGIN
  SELECT * INTO existing_identity
  FROM public.project_boq_item_identities identity
  WHERE identity.boq_id = NEW.boq_id AND identity.line_id = NEW.line_id;

  IF FOUND THEN
    IF existing_identity.project_id IS DISTINCT FROM NEW.project_id
       OR existing_identity.ontology_version_id IS DISTINCT FROM NEW.ontology_version_id
       OR existing_identity.work_group_id IS DISTINCT FROM NEW.work_group_id
       OR existing_identity.item_kind IS DISTINCT FROM NEW.item_kind
       OR existing_identity.standard_definition_id IS DISTINCT FROM NEW.standard_definition_id THEN
      RAISE EXCEPTION 'PROJECT_BOQ_LINE_IDENTITY_IMMUTABLE: line % cannot change kind or classification', NEW.line_id
        USING ERRCODE = '23514';
    END IF;
  ELSE
    INSERT INTO public.project_boq_item_identities(
      boq_id, line_id, project_id, ontology_version_id, work_group_id,
      item_kind, standard_definition_id, first_seen_version_id
    ) VALUES (
      NEW.boq_id, NEW.line_id, NEW.project_id, NEW.ontology_version_id, NEW.work_group_id,
      NEW.item_kind, NEW.standard_definition_id, NEW.boq_version_id
    );
  END IF;

  IF NEW.item_kind = 'STANDARD' THEN
    SELECT * INTO standard_definition
    FROM public.work_ontology_boq_item_definitions definition
    WHERE definition.ontology_version_id = NEW.ontology_version_id
      AND definition.id = NEW.standard_definition_id
      AND definition.work_group_id = NEW.work_group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_STANDARD_BOQ_DEFINITION'
        USING ERRCODE = '23503';
    END IF;
    IF btrim(NEW.description) IS DISTINCT FROM standard_definition.label
       OR btrim(NEW.unit) IS DISTINCT FROM standard_definition.default_unit THEN
      RAISE EXCEPTION 'STANDARD_BOQ_METADATA_MISMATCH: standard description and unit are ontology-controlled'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_boq_items_enforce_identity ON public.project_boq_items;
CREATE TRIGGER project_boq_items_enforce_identity
  BEFORE INSERT ON public.project_boq_items
  FOR EACH ROW EXECUTE FUNCTION private.enforce_project_boq_item_identity();

DROP TRIGGER IF EXISTS project_boq_item_identities_immutable ON public.project_boq_item_identities;
CREATE TRIGGER project_boq_item_identities_immutable
  BEFORE UPDATE OR DELETE ON public.project_boq_item_identities
  FOR EACH ROW EXECUTE FUNCTION private.prevent_project_boq_snapshot_mutation();

REVOKE ALL ON FUNCTION private.enforce_project_boq_item_identity()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.project_boq_item_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_boq_item_identities_select" ON public.project_boq_item_identities;
CREATE POLICY "project_boq_item_identities_select" ON public.project_boq_item_identities
  FOR SELECT TO authenticated USING (public.can_access_project(project_id));

REVOKE ALL ON TABLE public.project_boq_item_identities
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_boq_item_identities TO authenticated;
