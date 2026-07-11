# Staging External Setup Checklist

Only the following external resources are missing:

- Create or identify a separate Supabase project explicitly named for OpenDay staging without copying production data or passwords.
- Record its project ref, staging URL, publishable/anon key and database connection credential in approved secret storage.
- Add the ref to `STAGING_ALLOWED_PROJECT_REFS`; set `DEPLOY_ENV=staging` and `STAGING_PROJECT_REF`.
- Create/link a Vercel Preview or staging-only project; do not assign the production domain or alias.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only in that staging environment.
- Configure staging Site URL and exact Auth redirect URLs.
- Establish backup/recovery evidence before schema deployment.

Production secrets, users and data must not be supplied for any checklist item.
