-- ==============================================================================
-- CourseCloud: Trash System Schema & Migration
-- Adds deleted_at support to courses and files tables
-- ==============================================================================

-- 1. Add deleted_at column to courses table (defaults to NULL so existing courses are active)
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add deleted_at column to files table (defaults to NULL so existing files are active)
ALTER TABLE public.files
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create indexes on deleted_at for optimal performance when filtering active vs trashed items
CREATE INDEX IF NOT EXISTS idx_courses_deleted_at ON public.courses(deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON public.files(deleted_at);

-- 4. Reload the PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- 5. Automatic 24-Hour Cleanup Architecture
--
-- NOTE ON STORAGE CLEANUP:
-- We deliberately DO NOT run an unconditional 'DELETE FROM files' inside raw PostgreSQL,
-- because SQL cannot directly access the private S3 storage API to remove files from the
-- 'course-files' bucket. Doing so would leave orphaned files consuming storage quota.
--
-- Instead, 24-hour cleanup is managed via the Supabase Edge Function:
--   `supabase/functions/cleanup-trash/index.ts`
-- which:
--   1. Identifies files where deleted_at < now() - INTERVAL '24 hours'
--   2. Deletes their objects from the 'course-files' Storage bucket first
--   3. Deletes the database rows ONLY after storage deletion succeeds
--   4. For courses older than 24h: deletes their associated Storage objects, then deletes the course
--
-- To trigger this Edge Function hourly via pg_cron (or a cron service):
--   SELECT cron.schedule(
--     'cleanup-expired-trash-hourly',
--     '0 * * * *',
--     $$
--     SELECT net.http_post(
--       url := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/cleanup-trash',
--       headers := '{"Authorization": "Bearer <YOUR-SERVICE-ROLE-KEY>"}'::jsonb
--     );
--     $$
--   );
-- ==============================================================================
