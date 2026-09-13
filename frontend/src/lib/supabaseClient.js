import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://bwrumfalvysyvdmqbmts.supabase.co";

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_6G1cK1-qQqOO7P4mEjm5Ww_JafHWU7M";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

/**
 * Resolves the environment-aware redirect URL for email authentication/confirmations.
 * - In production: defaults to the deployed Amplify app URL (https://main.dmsfeq48ishbj.amplifyapp.com)
 *   or custom override from VITE_AUTH_REDIRECT_URL / VITE_SITE_URL.
 * - In local development: defaults to the current browser origin (e.g. http://localhost:5173).
 */
export function getAuthRedirectUrl() {
  if (import.meta.env.VITE_AUTH_REDIRECT_URL) {
    return import.meta.env.VITE_AUTH_REDIRECT_URL;
  }
  if (import.meta.env.PROD) {
    return (
      import.meta.env.VITE_SITE_URL ||
      "https://main.dmsfeq48ishbj.amplifyapp.com"
    );
  }
  return (
    (typeof window !== "undefined" && window.location?.origin) ||
    import.meta.env.VITE_SITE_URL ||
    "http://localhost:5173"
  );
}