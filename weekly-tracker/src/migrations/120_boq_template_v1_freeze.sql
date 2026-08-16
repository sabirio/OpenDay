-- 120_boq_template_v1_freeze.sql
-- Audit and immutable release marker for the existing canonical BOQ Template v1.

BEGIN;

DO $$
DECLARE v_version uuid;v_disciplines integer;v_groups integer;v_lines integer;v_duplicates integer;v_line_count_issues integer;
BEGIN
  SELECT id INTO v_version FROM public.work_ontology_versions WHERE status='PUBLISHED' AND is_active=true;
  IF v_version IS NULL THEN RAISE EXCEPTION 'BOQ_TEMPLATE_REQUIRES_ACTIVE_ONTOLOGY' USING ERRCODE='55000';END IF;
  SELECT count(*) INTO v_disciplines FROM public.work_ontology_disciplines WHERE ontology_version_id=v_version;
  SELECT count(*) INTO v_groups FROM public.work_ontology_work_groups WHERE ontology_version_id=v_version AND is_active;
  SELECT count(*) INTO v_lines FROM public.work_ontology_boq_item_definitions line JOIN public.work_ontology_work_groups group_row
    ON group_row.ontology_version_id=line.ontology_version_id AND group_row.id=line.work_group_id
    WHERE line.ontology_version_id=v_version AND group_row.is_active;
  SELECT count(*) INTO v_duplicates FROM(
    SELECT lower(regexp_replace(label,'[^a-z0-9]+','','g')) FROM public.work_ontology_work_groups
    WHERE ontology_version_id=v_version AND is_active GROUP BY lower(regexp_replace(label,'[^a-z0-9]+','','g')) HAVING count(*)>1
  ) duplicate;
  SELECT count(*) INTO v_line_count_issues FROM(
    SELECT group_row.id FROM public.work_ontology_work_groups group_row LEFT JOIN public.work_ontology_boq_item_definitions line
      ON line.ontology_version_id=group_row.ontology_version_id AND line.work_group_id=group_row.id
    WHERE group_row.ontology_version_id=v_version AND group_row.is_active GROUP BY group_row.id HAVING count(line.id)<3 OR count(line.id)>5
  ) issue;
  IF v_disciplines<>12 OR v_groups<>141 OR v_lines<>563 OR v_duplicates<>0 OR v_line_count_issues<>0 THEN
    RAISE EXCEPTION 'BOQ_TEMPLATE_V1_AUDIT_FAILED: disciplines %, groups %, lines %, duplicates %, line issues %',v_disciplines,v_groups,v_lines,v_duplicates,v_line_count_issues USING ERRCODE='55000';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.boq_template_releases(
  id uuid PRIMARY KEY,
  release_code text NOT NULL UNIQUE,
  ontology_version_id uuid NOT NULL UNIQUE REFERENCES public.work_ontology_versions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status='FROZEN'),
  structure_hash text NOT NULL CHECK(char_length(structure_hash)=64),
  audit_snapshot jsonb NOT NULL CHECK(jsonb_typeof(audit_snapshot)='object'),
  frozen_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.boq_template_releases(id,release_code,ontology_version_id,status,structure_hash,audit_snapshot)
SELECT gen_random_uuid(),'BOQ_TEMPLATE_V1',version.id,'FROZEN',encode(digest((
  SELECT string_agg(entry,'|' ORDER BY entry) FROM(
    SELECT 'D:'||discipline.code||':'||discipline.label entry FROM public.work_ontology_disciplines discipline WHERE discipline.ontology_version_id=version.id
    UNION ALL SELECT 'W:'||group_row.code||':'||group_row.label FROM public.work_ontology_work_groups group_row WHERE group_row.ontology_version_id=version.id AND group_row.is_active
    UNION ALL SELECT 'L:'||group_row.code||':'||line.code||':'||line.label||':'||line.default_unit FROM public.work_ontology_boq_item_definitions line JOIN public.work_ontology_work_groups group_row ON group_row.id=line.work_group_id AND group_row.ontology_version_id=line.ontology_version_id WHERE line.ontology_version_id=version.id AND group_row.is_active
  ) entries
),'sha256'),'hex'),jsonb_build_object('decision','READY_TO_FREEZE','disciplineCount',12,'canonicalCategoryCount',141,'standardLineCount',563,'duplicateCategoryCount',0,'duplicateLineCount',0,'categoryLineCountIssueCount',0,'inactiveCategoryCount',18,'comparisonLevel','CANONICAL_CATEGORY')
FROM public.work_ontology_versions version WHERE version.status='PUBLISHED' AND version.is_active=true
ON CONFLICT(release_code) DO NOTHING;

CREATE OR REPLACE FUNCTION private.prevent_boq_template_release_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'BOQ_TEMPLATE_RELEASE_IMMUTABLE' USING ERRCODE='55000';END;$$;
DROP TRIGGER IF EXISTS boq_template_releases_immutable ON public.boq_template_releases;
CREATE TRIGGER boq_template_releases_immutable BEFORE UPDATE OR DELETE ON public.boq_template_releases FOR EACH ROW EXECUTE FUNCTION private.prevent_boq_template_release_mutation();
ALTER TABLE public.boq_template_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY boq_template_release_read ON public.boq_template_releases FOR SELECT TO authenticated USING(true);
REVOKE ALL ON TABLE public.boq_template_releases FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.boq_template_releases TO authenticated;
REVOKE ALL ON FUNCTION private.prevent_boq_template_release_mutation() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
