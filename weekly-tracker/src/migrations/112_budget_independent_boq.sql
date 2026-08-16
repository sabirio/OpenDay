-- 112_budget_independent_boq.sql
-- BOQ is an independent contractor schedule. Budget comparison remains a PM read model.

DROP FUNCTION IF EXISTS public.activate_project_boq_unbudgeted_work_group(bigint,uuid,text,text,uuid);
DROP TABLE IF EXISTS public.project_boq_unbudgeted_work_groups;
DROP FUNCTION IF EXISTS private.prevent_project_boq_scope_activation_mutation();
