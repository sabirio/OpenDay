-- 068_project_boq_work_group_aggregation.sql
-- Roadmap Phase C.12: deterministic Work Group commercial rollups for one
-- immutable Project BOQ revision. No snapshot data is copied or mutated.

CREATE OR REPLACE VIEW public.project_boq_work_group_totals
WITH (security_invoker = true)
AS
SELECT
  item.boq_version_id,
  item.boq_id,
  item.project_id,
  item.ontology_version_id,
  boq.currency_code,
  version.revision_number,
  discipline.id AS discipline_id,
  discipline.code AS discipline_code,
  discipline.label AS discipline_label,
  discipline.display_order AS discipline_display_order,
  work_group.id AS work_group_id,
  work_group.code AS work_group_code,
  work_group.label AS work_group_label,
  work_group.display_order AS work_group_display_order,
  count(*)::integer AS line_count,
  count(*) FILTER (WHERE item.item_kind = 'STANDARD')::integer AS standard_line_count,
  count(*) FILTER (WHERE item.item_kind = 'CUSTOM')::integer AS custom_line_count,
  count(*) FILTER (WHERE item.unit_rate IS NOT NULL)::integer AS priced_line_count,
  count(*) FILTER (WHERE item.unit_rate IS NULL)::integer AS unpriced_line_count,
  COALESCE(sum(item.line_total), 0)::numeric(24,2) AS priced_total,
  bool_and(item.unit_rate IS NOT NULL) AS is_fully_priced
FROM public.project_boq_items item
JOIN public.project_boq_versions version
  ON version.id = item.boq_version_id
 AND version.boq_id = item.boq_id
 AND version.project_id = item.project_id
 AND version.ontology_version_id = item.ontology_version_id
JOIN public.project_boqs boq
  ON boq.id = item.boq_id
 AND boq.project_id = item.project_id
 AND boq.ontology_version_id = item.ontology_version_id
JOIN public.work_ontology_work_groups work_group
  ON work_group.ontology_version_id = item.ontology_version_id
 AND work_group.id = item.work_group_id
JOIN public.work_ontology_disciplines discipline
  ON discipline.ontology_version_id = work_group.ontology_version_id
 AND discipline.id = work_group.discipline_id
GROUP BY
  item.boq_version_id,
  item.boq_id,
  item.project_id,
  item.ontology_version_id,
  boq.currency_code,
  version.revision_number,
  discipline.id,
  discipline.code,
  discipline.label,
  discipline.display_order,
  work_group.id,
  work_group.code,
  work_group.label,
  work_group.display_order;

COMMENT ON VIEW public.project_boq_work_group_totals IS
  'C.12 read-only Work Group totals projected from immutable Project BOQ revisions.';

REVOKE ALL ON TABLE public.project_boq_work_group_totals
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_boq_work_group_totals TO authenticated;
