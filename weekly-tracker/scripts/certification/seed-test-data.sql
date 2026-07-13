\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.projects (
  id, store_code, shopping_mall_name, country, city,
  general_contractor, project_type, project_status
) VALUES (
  910001, 'E2E-CONTRACTOR-BASE', 'E2E Contractor Anchor Mall', 'Testland', 'Testville',
  'E2E Contractor', 'New Opening', 'Active'
)
ON CONFLICT (id) DO UPDATE SET
  store_code = EXCLUDED.store_code,
  shopping_mall_name = EXCLUDED.shopping_mall_name,
  country = EXCLUDED.country,
  city = EXCLUDED.city,
  general_contractor = EXCLUDED.general_contractor,
  project_type = EXCLUDED.project_type,
  project_status = EXCLUDED.project_status;

INSERT INTO public.profiles (id, name, role, assigned_projects, email) VALUES
  (:'admin_id'::uuid, 'E2E Admin', 'Admin', '{}', 'admin@openday.fit'),
  (:'pm_id'::uuid, 'E2E PM', 'PM', '{}', 'pm@openday.fit'),
  (:'contractor_id'::uuid, 'E2E Contractor', 'Contractor', '{910001}', 'gc@openday.fit'),
  (:'viewer_id'::uuid, 'E2E Viewer', 'Viewer', '{}', 'viewer@construction.com')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  assigned_projects = EXCLUDED.assigned_projects,
  email = EXCLUDED.email;

COMMIT;
