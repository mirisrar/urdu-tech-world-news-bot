/**
 * Supabase client singleton for Nexora News Urdu (vanilla JS, no build step).
 *
 * Loaded as a native ES module — works directly in the browser via
 * <script type="module" src="..."> with no bundler required. The Supabase
 * JS SDK itself is imported from a CDN (esm.sh mirrors the npm package as
 * an ES module) so no npm install/build step is needed for this static site.
 *
 * IMPORTANT: only ever use the Supabase **anon** key here — never the
 * service_role key. The anon key is safe to expose in client-side code
 * ONLY because Row Level Security restricts it to read-only access on the
 * `news` table (see database/rls-policy.sql in this folder, and
 * DATABASE_SCHEMA.md / SECURITY_GUIDELINES.md in the bot repo). Exposing a
 * key with write access here would let any website visitor modify the
 * database from their browser console.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let client = null;

/**
 * Returns a shared Supabase client instance (created once, reused across
 * every call site in the site).
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured — copy config.example.js to config.js and fill in SUPABASE_URL/SUPABASE_ANON_KEY."
    );
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return client;
}
