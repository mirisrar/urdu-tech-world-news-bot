/**
 * Live updates: subscribes to new rows being inserted into `news`, so the
 * website can show new articles (e.g. prepend to a Breaking News ticker or
 * the Latest News list) without the visitor needing to refresh the page.
 *
 * Requires Realtime to be enabled for the `news` table in Supabase
 * (dashboard -> Database -> Replication -> toggle "news" on — see
 * database/rls-policy.sql's comment for the SQL equivalent). If Realtime
 * isn't enabled, subscribeToNewArticles() simply never fires — it doesn't
 * throw, so pages that don't need live updates aren't affected either way.
 */

import { getSupabaseClient } from "./supabaseClient.js";

/**
 * Calls `onNewArticle` with the new row every time one is inserted into
 * `news`, for as long as the returned unsubscribe function isn't called.
 *
 * @param {(article: object) => void} onNewArticle
 * @returns {() => void} Call this (e.g. on page unload) to stop listening.
 *
 * @example
 * const stopListening = subscribeToNewArticles((article) => {
 *   prependToBreakingNewsTicker(article);
 * });
 * // later, e.g. when navigating away:
 * stopListening();
 */
export function subscribeToNewArticles(onNewArticle) {
  const supabase = getSupabaseClient();

  const channel = supabase
    .channel("news-inserts")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "news" },
      (payload) => onNewArticle(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
