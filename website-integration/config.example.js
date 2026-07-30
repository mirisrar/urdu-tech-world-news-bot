/**
 * Copy this file to config.js (kept out of version control if you'd
 * rather not commit even the anon key — see the README) and fill in your
 * project's values. Find both at: Supabase dashboard -> Settings -> API.
 *
 * SUPABASE_ANON_KEY is the PUBLIC "anon" key — safe to ship in client-side
 * code, but ONLY once the read-only RLS policy in this folder's
 * database/rls-policy.sql has been applied. Never put the service_role
 * key here.
 */

export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// Phase 10 SEO — used for absolute og:url / og:image / canonical.
// Example: "https://nexora-news.vercel.app" (no trailing slash).
export const SITE_ORIGIN = "https://YOUR-SITE-DOMAIN";
export const SITE_NAME = "Nexora News Urdu";
