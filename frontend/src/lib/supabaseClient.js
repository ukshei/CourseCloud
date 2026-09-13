import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://bwrumfalvysyvdmqbmts.supabase.co";

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_6G1cK1-qQqOO7P4mEjm5Ww_JafHWU7M";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);