-- 023_contractor_report_lookahead_fields.sql
--
-- Bug: the contractor submit form (LookAheadDeclarationSection.jsx) collects
-- Look Ahead (next_week_top3, week_after_top3, activities_blocked,
-- delay_reason) and Declaration/Comments (pending_issues, final_comments), and
-- 018's RPC receives all of it via p_meta->'reportSnapshot' — but its INSERT
-- INTO contractor_reports never wrote those columns, so every report
-- submitted since P0.1 shipped had this data silently discarded. It only
-- ever reached progress_history.snapshot->'legacy_report' as an opaque JSONB
-- blob nothing reads back, so Weekly Reports' "Look Ahead"/"Declaration"
-- panels (ReportLinksBlock.jsx) always showed "No look-ahead submitted" /
-- "No comments" regardless of what the contractor actually typed.
--
-- Fix: add the 6 columns to contractor_reports and have the RPC populate
-- them from the same reportSnapshot it already receives. Superseding the
-- function body via CREATE OR REPLACE is safe here — this RPC has exactly
-- one call site (contractorReportService.submitReport()), unlike
-- can_access_project()'s 12+ call sites in 022, which is why that fix used a
-- new function name instead of replacing in place.
--
-- Rollback:
--   ALTER TABLE public.contractor_reports
--     DROP COLUMN IF EXISTS next_week_top3,
--     DROP COLUMN IF EXISTS week_after_top3,
--     DROP COLUMN IF EXISTS activities_blocked,
--     DROP COLUMN IF EXISTS delay_reason,
--     DROP COLUMN IF EXISTS pending_issues,
--     DROP COLUMN IF EXISTS final_comments;
--   -- then re-apply 018_submit_contractor_report_rpc.sql's original
--   -- CREATE OR REPLACE FUNCTION body to restore the prior INSERT list.

ALTER TABLE public.contractor_reports
  ADD COLUMN IF NOT EXISTS next_week_top3    text,
  ADD COLUMN IF NOT EXISTS week_after_top3   text,
  ADD COLUMN IF NOT EXISTS activities_blocked text,
  ADD COLUMN IF NOT EXISTS delay_reason      text,
  ADD COLUMN IF NOT EXISTS pending_issues    text,
  ADD COLUMN IF NOT EXISTS final_comments    text;

CREATE OR REPLACE FUNCTION public.submit_contractor_report(
  p_project_id bigint,
  p_report_date date,
  p_wp_progress jsonb DEFAULT '[]'::jsonb,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_profile_company text;
  v_assigned_projects integer[] := '{}'::integer[];
  v_user_email text;
  v_project_company text;
  v_contractor_email text;
  v_week_number integer;
  v_overall_progress numeric;
  v_history_progress numeric;
  v_photo_urls text[] := '{}'::text[];
  v_report public.contractor_reports%ROWTYPE;
  v_wp_count integer := 0;
  v_wp_line_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_wp_progress IS NULL OR jsonb_typeof(p_wp_progress) <> 'array' THEN
    RAISE EXCEPTION 'p_wp_progress must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(p.role), p.company_id, COALESCE(p.assigned_projects, '{}'::integer[]), lower(u.email)
    INTO v_role, v_profile_company, v_assigned_projects, v_user_email
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile is required to submit contractor reports'
      USING ERRCODE = '28000';
  END IF;

  SELECT company_id, lower(contractor_email)
    INTO v_project_company, v_contractor_email
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_profile_company IS NOT NULL
     AND v_project_company IS NOT NULL
     AND v_profile_company <> v_project_company THEN
    RAISE EXCEPTION 'Not authorized for this company'
      USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('admin', 'pm') THEN
    NULL;
  ELSIF v_role = 'contractor' THEN
    IF NOT (
      p_project_id = ANY(v_assigned_projects::bigint[])
      OR (v_contractor_email IS NOT NULL AND v_contractor_email = v_user_email)
    ) THEN
      RAISE EXCEPTION 'Not authorized to submit for this project'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Role % cannot submit contractor reports', v_role
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contractor_reports
    WHERE project_id = p_project_id
      AND submitted_by = v_uid
      AND report_date = p_report_date
  ) THEN
    RAISE EXCEPTION 'A contractor report already exists for this project and report date'
      USING ERRCODE = '23505';
  END IF;

  v_week_number := EXTRACT(WEEK FROM p_report_date)::integer;

  SELECT COALESCE(array_agg(value), '{}'::text[])
    INTO v_photo_urls
  FROM jsonb_array_elements_text(COALESCE(p_meta->'photoUrls', '[]'::jsonb)) AS value;

  -- P1.4: v_overall_progress -> contractor_reports.overall_progress is the
  -- contractor-submitted RAW signal for this single report: p_meta.overallProgress
  -- if the client sent it, else an unweighted average of this report's WP
  -- percentages. It is intentionally NOT phase-weighted and must never be
  -- treated as "the" official project progress.
  SELECT COALESCE(
      NULLIF(p_meta->>'overallProgress', '')::numeric,
      (SELECT round(avg((item->>'progress_pct')::numeric))
       FROM jsonb_array_elements(p_wp_progress) AS item
       WHERE item ? 'progress_pct'),
      0
    )
    INTO v_overall_progress;

  -- v_history_progress -> progress_history.overall_progress is meant to be the
  -- canonical phase-weighted project progress (calculateProjectProgressResult()
  -- on the client, computed across ALL reports to date, not just this one).
  -- The fallback to v_overall_progress below exists only so a client that omits
  -- cumulativeProgress doesn't fail the insert — every current client
  -- (ContractorReport.jsx) always sends it explicitly. Do not rely on this
  -- fallback as a substitute for the real calculation; a client that starts
  -- omitting cumulativeProgress would silently poison progress_history with
  -- the unweighted raw average instead.
  v_history_progress := COALESCE(
    NULLIF(p_meta->>'cumulativeProgress', '')::numeric,
    v_overall_progress
  );

  INSERT INTO public.contractor_reports (
    project_id,
    submitted_by,
    report_date,
    week_number,
    overall_progress,
    status,
    photo_urls,
    next_week_top3,
    week_after_top3,
    activities_blocked,
    delay_reason,
    pending_issues,
    final_comments
  )
  VALUES (
    p_project_id,
    v_uid,
    p_report_date,
    v_week_number,
    v_overall_progress,
    'submitted',
    v_photo_urls,
    NULLIF(p_meta->'reportSnapshot'->>'nextWeekTop3', ''),
    NULLIF(p_meta->'reportSnapshot'->>'weekAfterTop3', ''),
    NULLIF(p_meta->'reportSnapshot'->>'activitiesBlocked', ''),
    NULLIF(p_meta->'reportSnapshot'->>'delayReason', ''),
    NULLIF(p_meta->'reportSnapshot'->>'pendingIssues', ''),
    NULLIF(p_meta->'reportSnapshot'->>'finalComments', '')
  )
  RETURNING * INTO v_report;

  WITH rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_wp_progress)
      AS x("wpId" text, progress_pct numeric, status text, comment text)
  ),
  inserted AS (
    INSERT INTO public.contractor_report_wps (
      report_id,
      project_id,
      wp_id,
      progress_pct,
      status,
      comment
    )
    SELECT
      v_report.id,
      p_project_id,
      "wpId",
      COALESCE(progress_pct, 0),
      COALESCE(status, 'not_started'),
      NULLIF(comment, '')
    FROM rows
    RETURNING *
  )
  SELECT COUNT(*), COALESCE(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb)
    INTO v_wp_count, v_wp_line_items
  FROM inserted;

  INSERT INTO public.progress_history (
    project_id,
    week_number,
    overall_progress,
    spi,
    recorded_at,
    snapshot
  )
  VALUES (
    p_project_id,
    v_week_number,
    v_history_progress,
    NULL,
    p_report_date::timestamptz,
    jsonb_build_object(
      'contractor_report_id', v_report.id,
      'master_report_id', p_meta->'masterReportId',
      'work_packages', p_wp_progress,
      'legacy_report', p_meta->'reportSnapshot'
    )
  );

  WITH rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_wp_progress)
      AS x("wpId" text, progress_pct numeric, status text)
  )
  UPDATE public.project_gantt_tasks t
     SET actual_progress = COALESCE(rows.progress_pct, 0),
         status = COALESCE(rows.status, 'not_started'),
         actual_start = CASE
           WHEN COALESCE(rows.progress_pct, 0) > 0 AND t.actual_start IS NULL
             THEN p_report_date
           ELSE t.actual_start
         END,
         actual_end = CASE
           WHEN COALESCE(rows.progress_pct, 0) >= 100
             THEN p_report_date
           ELSE t.actual_end
         END,
         updated_at = now()
  FROM rows
  WHERE t.project_id = p_project_id
    AND t.wp_id = rows."wpId";

  RETURN jsonb_build_object(
    'report', to_jsonb(v_report),
    'wpLineItems', v_wp_line_items,
    'lineItemCount', v_wp_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contractor_report(bigint, date, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contractor_report(bigint, date, jsonb, jsonb) TO authenticated;
