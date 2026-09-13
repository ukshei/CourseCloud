-- ==============================================================================
-- CourseCloud: Secure Scheduled Trash Cleanup Architecture
--
-- Architecture:
-- 1. CLEANUP_AUTH_SECRET is stored encrypted in Supabase Vault.
-- 2. public.invoke_cleanup_trash() dynamically retrieves it from Vault inside
--    a restricted SECURITY DEFINER function.
-- 3. pg_net sends Authorization: Bearer <CLEANUP_AUTH_SECRET> to the Edge Function.
-- 4. The Edge Function validates CLEANUP_AUTH_SECRET before proceeding.
-- 5. pg_cron schedules invoke_cleanup_trash() hourly without any credentials.
-- 6. No credentials, tokens, or project references are exposed in query logs.
-- ==============================================================================

-- 1. Enable required extensions in Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ==============================================================================
-- 2. Insert CLEANUP_AUTH_SECRET into Supabase Vault
--
-- Instructions:
-- Replace '<YOUR-DEDICATED-SECRET>' with a strong random secret of your choice
-- (e.g. generated via password manager or `openssl rand -hex 32`).
--
-- Notice: We do NOT use RAISE NOTICE with secrets so nothing is echoed into
-- transaction logs or SQL query results.
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cleanup_auth_secret'
  ) THEN
    PERFORM vault.create_secret(
      '<YOUR-DEDICATED-SECRET>',
      'cleanup_auth_secret',
      'Dedicated secret token for authenticating hourly cleanup-trash Edge Function'
    );
  END IF;
END;
$$;

-- ==============================================================================
-- 3. Stored Procedure: invoke_cleanup_trash()
--
-- Retrieves CLEANUP_AUTH_SECRET dynamically from Vault at runtime.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.invoke_cleanup_trash()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_secret TEXT;
  v_project_url TEXT;
BEGIN
  -- Retrieve secret from Vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cleanup_auth_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret "cleanup_auth_secret" not found in Supabase Vault.';
  END IF;

  -- Construct project Edge Function endpoint URL
  -- Replace <YOUR-PROJECT-REF> with your actual project reference
  v_project_url := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/cleanup-trash';

  -- Asynchronously invoke Edge Function via pg_net
  PERFORM net.http_post(
    url := v_project_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Restrict execution privileges (public / anon / authenticated cannot execute)
REVOKE EXECUTE ON FUNCTION public.invoke_cleanup_trash() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_cleanup_trash() FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoke_cleanup_trash() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_cleanup_trash() TO postgres;
GRANT EXECUTE ON FUNCTION public.invoke_cleanup_trash() TO service_role;

-- ==============================================================================
-- 4. Hourly pg_cron Schedule
--
-- Notice: No tokens, keys, or passwords appear in the cron definition.
-- ==============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('coursecloud-cleanup-trash-hourly');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'coursecloud-cleanup-trash-hourly',
  '0 * * * *',
  'SELECT public.invoke_cleanup_trash();'
);
