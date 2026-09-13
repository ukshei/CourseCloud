/**
 * supabaseClient.js
 *
 * Singleton Supabase client initialized with the service-role key.
 * Using the service-role key allows the backend to:
 *   - Perform Storage operations that require elevated privileges.
 *   - Perform admin authentication checks (e.g. verifying tokens).
 *
 * For database queries (.from), an AsyncLocalStorage context allows
 * queries to automatically run with the authenticated user's JWT token
 * when within an authenticated HTTP request, enforcing RLS and table
 * permissions seamlessly while falling back to the admin client.
 *
 * NEVER expose this client or the service-role key to the browser.
 */

const { AsyncLocalStorage } = require("node:async_hooks");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
  );
}

const asyncLocalStorage = new AsyncLocalStorage();

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    // Disable auto-session management — this is a server-side client.
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

function getScopedClient(token) {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function runWithUserToken(token, fn) {
  const scopedClient = getScopedClient(token);
  return asyncLocalStorage.run({ client: scopedClient, token }, fn);
}

const supabaseProxy = new Proxy(adminClient, {
  get(target, prop) {
    if (prop === "from") {
      const store = asyncLocalStorage.getStore();
      if (store && store.client) {
        return store.client.from.bind(store.client);
      }
    }
    return target[prop];
  },
});

supabaseProxy.admin = adminClient;
supabaseProxy.runWithUserToken = runWithUserToken;

module.exports = supabaseProxy;
