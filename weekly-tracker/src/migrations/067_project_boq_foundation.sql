-- 067_project_boq_foundation.sql
-- Roadmap Phase C.11: native, versioned BOQ domain/data foundation.
-- Deliberately excludes Work Group aggregation, BOQ -> Execution Scope
-- mapping, Excel I/O, tender rounds, bidder access, and the native editor.

CREATE UNIQUE INDEX IF NOT EXISTS work_ontology_boq_definitions_version_id_group_uniq
  ON public.work_ontology_boq_item_definitions(ontology_version_id, id, work_group_id);

CREATE TABLE IF NOT EXISTS public.project_boqs (
  id uuid PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  ontology_version_id uuid NOT NULL REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (btrim(title) <> ''),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id, ontology_version_id)
);

CREATE INDEX IF NOT EXISTS project_boqs_project_idx ON public.project_boqs(project_id);

CREATE TABLE IF NOT EXISTS public.project_boq_versions (
  id bigserial PRIMARY KEY,
  boq_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  source_kind text NOT NULL DEFAULT 'NATIVE' CHECK (source_kind IN ('NATIVE', 'IMPORT', 'SYSTEM')),
  revision_note text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boq_id, revision_number),
  UNIQUE (id, boq_id, project_id, ontology_version_id),
  FOREIGN KEY (boq_id, project_id, ontology_version_id)
    REFERENCES public.project_boqs(id, project_id, ontology_version_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS project_boq_versions_project_idx
  ON public.project_boq_versions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_boq_items (
  boq_version_id bigint NOT NULL,
  line_id uuid NOT NULL,
  boq_id uuid NOT NULL,
  project_id bigint NOT NULL,
  ontology_version_id uuid NOT NULL,
  work_group_id uuid NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('STANDARD', 'CUSTOM')),
  standard_definition_id uuid,
  description text NOT NULL CHECK (btrim(description) <> ''),
  unit text NOT NULL CHECK (btrim(unit) <> ''),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  unit_rate numeric(20,6) CHECK (unit_rate IS NULL OR unit_rate >= 0),
  line_total numeric(24,2) GENERATED ALWAYS AS (round(quantity * unit_rate, 2)) STORED,
  contractor_note text,
  reference text,
  specification text,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (boq_version_id, line_id),
  FOREIGN KEY (boq_version_id, boq_id, project_id, ontology_version_id)
    REFERENCES public.project_boq_versions(id, boq_id, project_id, ontology_version_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, work_group_id)
    REFERENCES public.work_ontology_work_groups(ontology_version_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, standard_definition_id, work_group_id)
    REFERENCES public.work_ontology_boq_item_definitions(ontology_version_id, id, work_group_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_boq_items_kind_shape_check CHECK (
    (item_kind = 'STANDARD' AND standard_definition_id IS NOT NULL)
    OR (item_kind = 'CUSTOM' AND standard_definition_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS project_boq_items_version_sort_idx
  ON public.project_boq_items(boq_version_id, sort_order, line_id);
CREATE INDEX IF NOT EXISTS project_boq_items_work_group_idx
  ON public.project_boq_items(ontology_version_id, work_group_id);

CREATE OR REPLACE FUNCTION private.prevent_project_boq_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'PROJECT_BOQ_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS project_boqs_immutable ON public.project_boqs;
CREATE TRIGGER project_boqs_immutable
  BEFORE UPDATE OR DELETE ON public.project_boqs
  FOR EACH ROW EXECUTE FUNCTION private.prevent_project_boq_snapshot_mutation();
DROP TRIGGER IF EXISTS project_boq_versions_immutable ON public.project_boq_versions;
CREATE TRIGGER project_boq_versions_immutable
  BEFORE UPDATE OR DELETE ON public.project_boq_versions
  FOR EACH ROW EXECUTE FUNCTION private.prevent_project_boq_snapshot_mutation();
DROP TRIGGER IF EXISTS project_boq_items_immutable ON public.project_boq_items;
CREATE TRIGGER project_boq_items_immutable
  BEFORE UPDATE OR DELETE ON public.project_boq_items
  FOR EACH ROW EXECUTE FUNCTION private.prevent_project_boq_snapshot_mutation();

REVOKE ALL ON FUNCTION private.prevent_project_boq_snapshot_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.project_boqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boq_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_boq_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_boqs_select" ON public.project_boqs;
CREATE POLICY "project_boqs_select" ON public.project_boqs
  FOR SELECT TO authenticated USING (public.can_access_project(project_id));
DROP POLICY IF EXISTS "project_boq_versions_select" ON public.project_boq_versions;
CREATE POLICY "project_boq_versions_select" ON public.project_boq_versions
  FOR SELECT TO authenticated USING (public.can_access_project(project_id));
DROP POLICY IF EXISTS "project_boq_items_select" ON public.project_boq_items;
CREATE POLICY "project_boq_items_select" ON public.project_boq_items
  FOR SELECT TO authenticated USING (public.can_access_project(project_id));

REVOKE ALL ON TABLE public.project_boqs, public.project_boq_versions, public.project_boq_items
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_boqs, public.project_boq_versions, public.project_boq_items
  TO authenticated;
REVOKE ALL ON SEQUENCE public.project_boq_versions_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_project_boq_revision(
  p_project_id bigint,
  p_boq_id uuid,
  p_title text,
  p_currency_code text,
  p_items jsonb,
  p_expected_latest_revision integer,
  p_revision_note text,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_project_ontology_version_id uuid;
  v_existing_boq public.project_boqs%ROWTYPE;
  v_request public.write_command_requests%ROWTYPE;
  v_current_revision integer;
  v_next_revision integer;
  v_version_id bigint;
  v_line_count integer;
  v_priced_line_count integer;
  v_total numeric(24,2);
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_boq_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'boq_id and client_request_id are required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'BOQ_TITLE_REQUIRED: title is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_currency_code, '') !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'INVALID_CURRENCY_CODE: use an ISO-style three-letter uppercase code'
      USING ERRCODE = '22023';
  END IF;
  IF p_expected_latest_revision IS NULL OR p_expected_latest_revision < 0 THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_REVISION: expected revision must be zero or greater'
      USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_BOQ: at least one BOQ line is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.write_command_requests(actor_id, operation, client_request_id, project_id)
  VALUES (v_uid, 'boq.save_revision', p_client_request_id, p_project_id)
  ON CONFLICT (actor_id, operation, client_request_id) DO NOTHING;

  SELECT * INTO v_request
  FROM public.write_command_requests
  WHERE actor_id = v_uid
    AND operation = 'boq.save_revision'
    AND client_request_id = p_client_request_id;

  IF v_request.project_id <> p_project_id THEN
    RAISE EXCEPTION 'Idempotency key belongs to another project' USING ERRCODE = '23505';
  END IF;
  IF v_request.response IS NOT NULL THEN
    IF v_request.response->>'boqId' IS DISTINCT FROM p_boq_id::text THEN
      RAISE EXCEPTION 'Idempotency key belongs to another BOQ' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.response || jsonb_build_object('idempotentReplay', true);
  END IF;

  SELECT project.work_ontology_version_id
    INTO v_project_ontology_version_id
  FROM public.projects project
  WHERE project.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id USING ERRCODE = 'P0002';
  END IF;
  IF v_project_ontology_version_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_BOQ_REQUIRES_WORK_ONTOLOGY: project is not pinned to a Work Ontology'
      USING ERRCODE = '55000';
  END IF;

  SELECT lower(role) INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL
     OR v_role NOT IN ('pm', 'admin')
     OR public.can_write_project(p_project_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized to manage this project BOQ' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing_boq
  FROM public.project_boqs boq
  WHERE boq.id = p_boq_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_boq.project_id IS DISTINCT FROM p_project_id
      OR v_existing_boq.ontology_version_id IS DISTINCT FROM v_project_ontology_version_id THEN
      RAISE EXCEPTION 'BOQ_IDENTITY_CONFLICT: BOQ belongs to another project or ontology'
        USING ERRCODE = '23505';
    END IF;
    IF v_existing_boq.title IS DISTINCT FROM btrim(p_title)
      OR v_existing_boq.currency_code IS DISTINCT FROM p_currency_code THEN
      RAISE EXCEPTION 'BOQ_METADATA_IMMUTABLE: title and currency are pinned when the BOQ is created'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    IF p_expected_latest_revision <> 0 THEN
      RAISE EXCEPTION 'BOQ_REVISION_CONFLICT: expected existing revision %, but BOQ does not exist',
        p_expected_latest_revision USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.project_boqs(
      id, project_id, ontology_version_id, title, currency_code, created_by
    ) VALUES (
      p_boq_id, p_project_id, v_project_ontology_version_id,
      btrim(p_title), p_currency_code, v_uid
    );
  END IF;

  SELECT COALESCE(max(version.revision_number), 0)
    INTO v_current_revision
  FROM public.project_boq_versions version
  WHERE version.boq_id = p_boq_id;

  IF v_current_revision IS DISTINCT FROM p_expected_latest_revision THEN
    RAISE EXCEPTION 'BOQ_REVISION_CONFLICT: expected revision %, current revision %',
      p_expected_latest_revision, v_current_revision USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE jsonb_typeof(item) <> 'object'
      OR COALESCE(item->>'lineId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(item->>'workGroupId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(item->>'itemKind', '') NOT IN ('STANDARD', 'CUSTOM')
      OR btrim(COALESCE(item->>'description', '')) = ''
      OR btrim(COALESCE(item->>'unit', '')) = ''
      OR COALESCE(item->>'quantity', '') !~ '^[0-9]+(?:\.[0-9]+)?$'
      OR (item->>'quantity')::numeric <= 0
      OR (
        item->>'unitRate' IS NOT NULL
        AND (
          item->>'unitRate' !~ '^[0-9]+(?:\.[0-9]+)?$'
          OR (item->>'unitRate')::numeric < 0
        )
      )
      OR COALESCE(item->>'sortOrder', '') !~ '^[0-9]+$'
      OR (
        item->>'itemKind' = 'STANDARD'
        AND COALESCE(item->>'standardDefinitionId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR (item->>'itemKind' = 'CUSTOM' AND item->>'standardDefinitionId' IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'INVALID_BOQ_LINE: every line requires valid identity, Work Group, kind, description, unit, quantity and order'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    GROUP BY item->>'lineId' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_BOQ_LINE: line IDs must be unique within a revision'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) item
    LEFT JOIN public.work_ontology_work_groups work_group
      ON work_group.ontology_version_id = v_project_ontology_version_id
     AND work_group.id = (item->>'workGroupId')::uuid
    WHERE work_group.id IS NULL
  ) THEN
    RAISE EXCEPTION 'UNKNOWN_BOQ_WORK_GROUP: every line must reference the pinned Work Ontology'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) item
    LEFT JOIN public.work_ontology_boq_item_definitions definition
      ON definition.ontology_version_id = v_project_ontology_version_id
     AND definition.id = (item->>'standardDefinitionId')::uuid
     AND definition.work_group_id = (item->>'workGroupId')::uuid
    WHERE item->>'itemKind' = 'STANDARD' AND definition.id IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_STANDARD_BOQ_DEFINITION: standard line definition must belong to its Work Group'
      USING ERRCODE = '22023';
  END IF;

  v_next_revision := v_current_revision + 1;
  INSERT INTO public.project_boq_versions(
    boq_id, project_id, ontology_version_id, revision_number,
    source_kind, revision_note, created_by
  ) VALUES (
    p_boq_id, p_project_id, v_project_ontology_version_id, v_next_revision,
    'NATIVE', NULLIF(btrim(COALESCE(p_revision_note, '')), ''), v_uid
  ) RETURNING id INTO v_version_id;

  INSERT INTO public.project_boq_items(
    boq_version_id, line_id, boq_id, project_id, ontology_version_id,
    work_group_id, item_kind, standard_definition_id, description, unit,
    quantity, unit_rate, contractor_note, reference, specification, sort_order
  )
  SELECT
    v_version_id,
    (item->>'lineId')::uuid,
    p_boq_id,
    p_project_id,
    v_project_ontology_version_id,
    (item->>'workGroupId')::uuid,
    item->>'itemKind',
    NULLIF(item->>'standardDefinitionId', '')::uuid,
    btrim(item->>'description'),
    btrim(item->>'unit'),
    (item->>'quantity')::numeric,
    NULLIF(item->>'unitRate', '')::numeric,
    NULLIF(btrim(COALESCE(item->>'contractorNote', '')), ''),
    NULLIF(btrim(COALESCE(item->>'reference', '')), ''),
    NULLIF(btrim(COALESCE(item->>'specification', '')), ''),
    (item->>'sortOrder')::integer
  FROM jsonb_array_elements(p_items) item;

  SELECT count(*), count(*) FILTER (WHERE item.unit_rate IS NOT NULL), COALESCE(sum(item.line_total), 0)
    INTO v_line_count, v_priced_line_count, v_total
  FROM public.project_boq_items item
  WHERE item.boq_version_id = v_version_id;

  v_result := jsonb_build_object(
    'boqId', p_boq_id,
    'projectId', p_project_id,
    'ontologyVersionId', v_project_ontology_version_id,
    'versionId', v_version_id,
    'revisionNumber', v_next_revision,
    'lineCount', v_line_count,
    'pricedLineCount', v_priced_line_count,
    'total', v_total,
    'currencyCode', p_currency_code
  );

  UPDATE public.write_command_requests
  SET response = v_result, completed_at = now()
  WHERE id = v_request.id;

  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_project_boq_revision(
  bigint, uuid, text, text, jsonb, integer, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_boq_revision(
  bigint, uuid, text, text, jsonb, integer, text, uuid
) TO authenticated;
