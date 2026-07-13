-- 031_snag_reassignment_semantics.sql
-- Preserve active work state during reassignment and forbid silent review invalidation.

CREATE OR REPLACE FUNCTION public.enforce_snag_reassignment_semantics()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    IF OLD.status = 'IN_PROGRESS' AND NEW.status = 'ASSIGNED' THEN
      NEW.status := 'IN_PROGRESS';
    ELSIF OLD.status = 'READY_FOR_REVIEW' THEN
      RAISE EXCEPTION 'READY_SNAG_REASSIGNMENT_REQUIRES_EXPLICIT_REJECTION' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER snags_reassignment_semantics
BEFORE UPDATE OF assignee_id, status ON public.snags
FOR EACH ROW EXECUTE FUNCTION public.enforce_snag_reassignment_semantics();

REVOKE ALL ON FUNCTION public.enforce_snag_reassignment_semantics() FROM PUBLIC, anon, authenticated;
