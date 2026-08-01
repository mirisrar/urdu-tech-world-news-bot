/**
 * Phase 9 — DB-backed publish retry (no Redis/BullMQ).
 *
 * After the normal collect→AI→save→publish pass, retry recent rows that
 * still need social publishing (saved to Supabase but channel post failed
 * or never ran). Uses existing publish columns on `news`.
 */

import { listConfiguredChannels, publishAll } from "./publishers/index.js";
import { canAttemptFacebook } from "./publishers/facebookThrottle.js";
import {
  wasFacebookPosted,
  markFacebookPosted,
  getFacebookPostedId
} from "./publishState.js";

const CHANNEL_ID_COLUMN = {
  facebook: "fb_post_id",
  telegram: "telegram_message_id",
  whatsapp: "whatsapp_status",
  x: "x_post_id"
};

/**
 * @param {object} row - news row
 * @param {string[]} configured - channel names
 * @returns {string[]} channels still missing a success marker
 */
export function missingChannelsForRow(row, configured) {
  return configured.filter((name) => {
    const col = CHANNEL_ID_COLUMN[name];
    if (!col) return false;
    const value = row[col];
    return value === null || value === undefined || value === "";
  });
}

/**
 * Load recent rows that still need at least one configured channel published.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ limit?: number, lookbackHours?: number }} [options]
 */
export async function fetchPublishRetryCandidates(supabase, options = {}) {
  const limit = options.limit ?? 10;
  const lookbackHours = options.lookbackHours ?? 48;
  const configured = listConfiguredChannels();
  if (configured.length === 0) {
    return { configured, rows: [] };
  }

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const selectCols = [
    "id",
    "title",
    "url",
    "urdu_title",
    "urdu_summary",
    "facebook_post",
    "hashtags",
    "image_url",
    "published_at",
    "fb_post_id",
    "telegram_message_id",
    "whatsapp_status",
    "x_post_id",
    "created_at"
  ].join(", ");

  const { data, error } = await supabase
    .from("news")
    .select(selectCols)
    .gte("created_at", since)
    .not("urdu_title", "is", null)
    .order("id", { ascending: false })
    .limit(Math.max(limit * 4, 40));

  if (error) {
    // Older schemas may lack publish columns or created_at — fail soft.
    throw new Error(`Publish retry query failed: ${error.message}`);
  }

  const rows = (data || [])
    .map((row) => ({
      row,
      missing: missingChannelsForRow(row, configured)
    }))
    .filter((entry) => entry.missing.length > 0)
    .slice(0, limit);

  return { configured, rows };
}

/**
 * Retry publishing for candidates. Fail-soft per row.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(newsId: number|string, publishResults: object) => Promise<void>} updatePublishStatus
 * @param {(level: string, message: string, meta?: object) => void} log
 * @param {{ limit?: number, lookbackHours?: number, skipFacebook?: boolean }} [options]
 * @returns {Promise<{ attempted: number, publishedAny: number, skipped: number }>}
 */
export async function retryPendingPublishes(supabase, updatePublishStatus, log, options = {}) {
  let candidates;
  try {
    candidates = await fetchPublishRetryCandidates(supabase, options);
  } catch (error) {
    log("warn", "Publish retry skipped — could not load candidates", {
      message: error.message
    });
    return { attempted: 0, publishedAny: 0, skipped: 0 };
  }

  if (candidates.configured.length === 0) {
    log("info", "Publish retry skipped — no social channels configured");
    return { attempted: 0, publishedAny: 0, skipped: 0 };
  }

  if (candidates.rows.length === 0) {
    log("info", "Publish retry: nothing pending");
    return { attempted: 0, publishedAny: 0, skipped: 0 };
  }

  let publishedAny = 0;
  let skipped = 0;

  for (const { row, missing } of candidates.rows) {
    if (!row.urdu_title) {
      skipped++;
      continue;
    }

    let channels = missing;

    // When facebook_queue owns FB posting, never retry Facebook here.
    if (options.skipFacebook) {
      channels = channels.filter((name) => name !== "facebook");
    }

    // Cross-run dedupe: if we already posted this newsId to Facebook (file
    // state) but DB fb_post_id was never saved, do NOT post again.
    if (channels.includes("facebook") && wasFacebookPosted(row.id)) {
      const priorId = getFacebookPostedId(row.id);
      if (priorId) {
        await updatePublishStatus(row.id, { facebook: { published: true, id: priorId } });
      }
      channels = channels.filter((name) => name !== "facebook");
      log("info", "Skipping Facebook retry — already posted (publish state)", {
        newsId: row.id,
        priorId: priorId || null
      });
    }

    // Don't burn the queue once Facebook's per-run quota is used — leave
    // remaining FB rows for the next cron.
    if (channels.includes("facebook") && !canAttemptFacebook()) {
      channels = channels.filter((name) => name !== "facebook");
    }

    if (channels.length === 0) {
      skipped++;
      continue;
    }

    try {
      const results = await publishAll(
        {
          urduTitle: row.urdu_title,
          urduSummary: row.urdu_summary || "",
          facebookPost: row.facebook_post || row.urdu_summary || row.urdu_title,
          hashtags: row.hashtags || "",
          imageUrl: row.image_url || "",
          sourceUrl: row.url || "",
          newsId: row.id
        },
        { onlyChannels: channels }
      );

      if (results.facebook?.published && results.facebook.id) {
        markFacebookPosted(row.id, results.facebook.id);
      }

      const anyOk = Object.values(results).some((r) => r.published);
      if (anyOk) {
        publishedAny++;
        await updatePublishStatus(row.id, results);
      }

      const summary = Object.entries(results)
        .filter(([, r]) => !r.skipped || r.reason)
        .map(([ch, r]) => {
          if (r.published) return `${ch}=ok`;
          if (r.skipped && r.reason) return `${ch}=deferred(${r.reason})`;
          return `${ch}=failed(${r.error})`;
        })
        .join(", ");

      log("info", "Publish retry result", {
        newsId: row.id,
        missing: missing.join(","),
        summary: summary || "no-op"
      });
    } catch (error) {
      log("warn", "Publish retry failed for row", {
        newsId: row.id,
        message: error.message
      });
    }
  }

  return {
    attempted: candidates.rows.length,
    publishedAny,
    skipped
  };
}
