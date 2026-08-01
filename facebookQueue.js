/**
 * Facebook publish queue — stagger posts every FACEBOOK_SCHEDULE_GAP_MS
 * (default 5 minutes) via Graph API when due.
 *
 * Table: facebook_queue (see website-integration/database/facebook-queue.sql)
 *
 * Flow:
 *   1. enqueueFacebookNews(...) after bot/admin news is saved
 *   2. processFacebookQueue(...) each cron run — post due rows
 */

import {
  buildFacebookMessage,
  buildWebsiteArticleUrl,
  publishToFacebook
} from "./publishers/facebook.js";
import { markFacebookPosted, wasFacebookPosted } from "./publishState.js";

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** @returns {number} gap between scheduled posts in ms (default 5 min) */
export function facebookScheduleGapMs() {
  return envInt("FACEBOOK_SCHEDULE_GAP_MS", 5 * 60 * 1000);
}

/**
 * Whether to use the DB queue (default true). Set FACEBOOK_USE_QUEUE=0
 * to fall back to immediate publish via publishAll.
 */
export function isFacebookQueueEnabled() {
  const raw = String(process.env.FACEBOOK_USE_QUEUE ?? "true").toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

/**
 * Next scheduled_at = max(now, last_scheduled + gap).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<Date>}
 */
export async function nextFacebookScheduleAt(supabase) {
  const gap = facebookScheduleGapMs();
  const now = Date.now();

  const { data, error } = await supabase
    .from("facebook_queue")
    .select("scheduled_at")
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table missing / RLS — schedule from now (caller may still fail on insert).
    return new Date(now);
  }

  const lastMs = data?.scheduled_at ? Date.parse(data.scheduled_at) : NaN;
  if (!Number.isFinite(lastMs)) {
    return new Date(now);
  }

  return new Date(Math.max(now, lastMs + gap));
}

/**
 * Build the exact caption stored on the queue row.
 * @param {object} opts
 * @param {string} opts.facebookPost
 * @param {string} [opts.hashtags]
 * @param {string|number} opts.newsId
 */
export function buildQueuedFacebookText({ facebookPost, hashtags, newsId }) {
  const websiteUrl = buildWebsiteArticleUrl(newsId);
  return buildFacebookMessage(facebookPost, hashtags, websiteUrl);
}

/**
 * Enqueue one news row for Facebook (idempotent on news_id).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} opts
 * @param {string|number} opts.newsId
 * @param {string} opts.facebookPost
 * @param {string} [opts.hashtags]
 * @param {string} [opts.imageUrl]
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @returns {Promise<{ queued: boolean, scheduledAt?: string, reason?: string }>}
 */
export async function enqueueFacebookNews(supabase, opts, log = () => {}) {
  const newsId = opts.newsId;
  if (newsId === null || newsId === undefined || newsId === "") {
    return { queued: false, reason: "missing_news_id" };
  }

  if (wasFacebookPosted(newsId)) {
    return { queued: false, reason: "already_posted_state" };
  }

  const postText = buildQueuedFacebookText({
    facebookPost: opts.facebookPost,
    hashtags: opts.hashtags,
    newsId
  });

  if (!postText.trim()) {
    return { queued: false, reason: "empty_post_text" };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("facebook_queue")
    .select("id, scheduled_at, status")
    .eq("news_id", newsId)
    .maybeSingle();

  if (existingErr) {
    log("warn", "facebook_queue enqueue failed (lookup)", {
      newsId,
      message: existingErr.message
    });
    return { queued: false, reason: existingErr.message };
  }

  if (existing) {
    return {
      queued: false,
      reason: "already_queued",
      scheduledAt: existing.scheduled_at
    };
  }

  const scheduledAt = await nextFacebookScheduleAt(supabase);

  const row = {
    news_id: newsId,
    status: "pending",
    scheduled_at: scheduledAt.toISOString(),
    post_text: postText,
    image_url: opts.imageUrl || null,
    error: null
  };

  const { data, error } = await supabase
    .from("facebook_queue")
    .insert(row)
    .select("id, scheduled_at, status")
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { queued: false, reason: "already_queued" };
    }
    log("warn", "facebook_queue enqueue failed", {
      newsId,
      message: error.message
    });
    return { queued: false, reason: error.message };
  }

  log("info", "Facebook queue: enqueued", {
    newsId,
    scheduledAt: data.scheduled_at,
    status: data.status
  });

  return { queued: true, scheduledAt: data.scheduled_at };
}

/**
 * Enqueue Admin / orphan news rows that have no facebook_queue entry yet
 * and are not already posted (B5).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @returns {Promise<number>} number newly queued
 */
export async function enqueueMissingNewsForFacebook(supabase, opts = {}, log = () => {}) {
  const limit = opts.limit ?? envInt("FACEBOOK_QUEUE_BACKFILL_LIMIT", 20);

  // Recent news without a queue row and without fb_post_id.
  const { data: newsRows, error } = await supabase
    .from("news")
    .select("id, facebook_post, urdu_summary, urdu_title, hashtags, image_url, fb_post_id")
    .is("fb_post_id", null)
    .order("id", { ascending: false })
    .limit(Math.max(limit * 3, 40));

  if (error) {
    log("warn", "facebook_queue backfill: could not load news", {
      message: error.message
    });
    return 0;
  }

  if (!newsRows?.length) return 0;

  const ids = newsRows.map((r) => r.id);
  const { data: queued, error: qErr } = await supabase
    .from("facebook_queue")
    .select("news_id")
    .in("news_id", ids);

  if (qErr) {
    log("warn", "facebook_queue backfill: could not load queue", {
      message: qErr.message
    });
    return 0;
  }

  const queuedSet = new Set((queued || []).map((r) => String(r.news_id)));
  let added = 0;

  // Oldest-first among candidates so schedule order is natural.
  const candidates = newsRows
    .filter((r) => !queuedSet.has(String(r.id)) && !wasFacebookPosted(r.id))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, limit);

  for (const row of candidates) {
    const facebookPost =
      row.facebook_post || row.urdu_summary || row.urdu_title || "";
    const result = await enqueueFacebookNews(
      supabase,
      {
        newsId: row.id,
        facebookPost,
        hashtags: row.hashtags || "",
        imageUrl: row.image_url || ""
      },
      log
    );
    if (result.queued) added += 1;
  }

  if (added > 0) {
    log("info", "Facebook queue: backfilled admin/orphan news", { added });
  }

  return added;
}

/**
 * Publish due pending queue rows (scheduled_at <= now).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(newsId: number|string, publishResults: object) => Promise<void>} updatePublishStatus
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @returns {Promise<{ posted: number, failed: number, skipped: number }>}
 */
export async function processFacebookQueue(supabase, updatePublishStatus, log = () => {}) {
  const maxPerRun = envInt("FACEBOOK_MAX_POSTS_PER_RUN", 1);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("facebook_queue")
    .select("id, news_id, post_text, image_url, scheduled_at")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(maxPerRun);

  if (error) {
    log("warn", "facebook_queue process: select failed", { message: error.message });
    return { posted: 0, failed: 0, skipped: 0 };
  }

  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due || []) {
    if (wasFacebookPosted(row.news_id)) {
      await supabase
        .from("facebook_queue")
        .update({
          status: "posted",
          posted_at: nowIso,
          error: "already_posted_state"
        })
        .eq("id", row.id);
      skipped += 1;
      continue;
    }

    try {
      const result = await publishToFacebook({
        facebookPost: row.post_text,
        imageUrl: row.image_url || undefined,
        newsId: row.news_id,
        // post_text already has caption → URL → hashtags
        rawMessage: true
      });

      if (result.skipped) {
        skipped += 1;
        log("info", "Facebook queue: deferred by throttle", {
          newsId: row.news_id,
          reason: result.reason
        });
        continue;
      }

      const postedAt = new Date().toISOString();
      await supabase
        .from("facebook_queue")
        .update({
          status: "posted",
          posted_at: postedAt,
          fb_post_id: result.id,
          error: null
        })
        .eq("id", row.id);

      markFacebookPosted(row.news_id, result.id);
      await updatePublishStatus(row.news_id, {
        facebook: { published: true, id: result.id }
      });

      posted += 1;
      log("info", "Facebook queue: posted", {
        newsId: row.news_id,
        fbPostId: result.id,
        scheduledAt: row.scheduled_at
      });
    } catch (err) {
      failed += 1;
      await supabase
        .from("facebook_queue")
        .update({
          status: "failed",
          error: String(err.message || err).slice(0, 500)
        })
        .eq("id", row.id);
      log("warn", "Facebook queue: publish failed", {
        newsId: row.news_id,
        message: err.message
      });
    }
  }

  return { posted, failed, skipped };
}
