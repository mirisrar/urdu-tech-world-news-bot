/**
 * Facebook native Scheduled posts + local queue tracking.
 *
 * Flow:
 *   1. Pick staggered scheduled_at (first >= now+10min — Meta minimum)
 *   2. Insert facebook_queue row
 *   3. Call Graph API with published=false + scheduled_publish_time
 *      → post appears in Facebook Page → Scheduled
 *   4. Mark queue status=scheduled + store fb_post_id
 *
 * processFacebookQueue() retries pending rows that failed to schedule.
 *
 * Table: facebook_queue (see website-integration/database/facebook-queue.sql)
 */

import {
  buildFacebookMessage,
  buildWebsiteArticleUrl,
  publishToFacebook
} from "./publishers/facebook.js";
import { evaluateFacebookEligibility } from "./publishers/facebookEligibility.js";
import {
  isFacebookStoriesEnabled,
  publishFacebookPhotoStory
} from "./publishers/facebookStories.js";
import { markFacebookPosted, wasFacebookPosted } from "./publishState.js";

/** Meta requires scheduled_publish_time at least ~10 minutes ahead. */
export const FACEBOOK_MIN_SCHEDULE_AHEAD_MS = 10 * 60 * 1000;

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Gap between scheduled slots (default 5 min). */
export function facebookScheduleGapMs() {
  return envInt("FACEBOOK_SCHEDULE_GAP_MS", 5 * 60 * 1000);
}

/**
 * Whether to use the queue + native FB schedule (default true).
 * Set FACEBOOK_USE_QUEUE=0 for immediate live publish via publishAll.
 */
export function isFacebookQueueEnabled() {
  const raw = String(process.env.FACEBOOK_USE_QUEUE ?? "true").toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

/**
 * Next schedule time: max(now+10min, last_scheduled + gap).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<Date>}
 */
export async function nextFacebookScheduleAt(supabase) {
  const gap = facebookScheduleGapMs();
  const earliest = Date.now() + FACEBOOK_MIN_SCHEDULE_AHEAD_MS;

  const { data, error } = await supabase
    .from("facebook_queue")
    .select("scheduled_at")
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return new Date(earliest);
  }

  const lastMs = data?.scheduled_at ? Date.parse(data.scheduled_at) : NaN;
  if (!Number.isFinite(lastMs)) {
    return new Date(earliest);
  }

  return new Date(Math.max(earliest, lastMs + gap));
}

/**
 * @param {object} opts
 * @param {string} opts.facebookPost
 * @param {string} [opts.hashtags]
 * @param {string|number} opts.newsId
 */
export function buildQueuedFacebookText({ facebookPost, hashtags, newsId, imageCredit }) {
  const websiteUrl = buildWebsiteArticleUrl(newsId);
  return buildFacebookMessage(facebookPost, hashtags, websiteUrl, imageCredit);
}

/**
 * Call Facebook Graph to create a native Scheduled post, then update queue row.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} row - facebook_queue row fields
 * @param {(newsId: number|string, publishResults: object) => Promise<void>} [updatePublishStatus]
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
async function scheduleRowOnFacebook(supabase, row, updatePublishStatus, log = () => {}) {
  const result = await publishToFacebook({
    facebookPost: row.post_text,
    imageUrl: row.image_url || undefined,
    newsId: row.news_id,
    rawMessage: true,
    scheduleAt: row.scheduled_at,
    skipGapThrottle: true
  });

  if (result.skipped) {
    return { ok: false, skipped: true, reason: result.reason };
  }

  const scheduledAt = result.scheduledAt || row.scheduled_at;
  await supabase
    .from("facebook_queue")
    .update({
      status: "scheduled",
      scheduled_at: scheduledAt,
      fb_post_id: result.id,
      error: null
    })
    .eq("id", row.id);

  markFacebookPosted(row.news_id, result.id);

  if (updatePublishStatus) {
    await updatePublishStatus(row.news_id, {
      facebook: { published: true, id: result.id }
    });
  }

  log("info", "Facebook: native scheduled", {
    newsId: row.news_id,
    fbPostId: result.id,
    scheduledAt
  });

  return { ok: true, id: result.id, scheduledAt };
}

/**
 * Enqueue + schedule one news item on Facebook (idempotent on news_id).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} opts
 * @param {string|number} opts.newsId
 * @param {string} opts.facebookPost
 * @param {string} [opts.hashtags]
 * @param {string} [opts.imageUrl]
 * @param {string} [opts.imageCredit]
 * @param {string} [opts.category]
 * @param {boolean} [opts.featured]
 * @param {string|Date} [opts.createdAt]
 * @param {(newsId: number|string, publishResults: object) => Promise<void>} [opts.updatePublishStatus]
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function enqueueFacebookNews(supabase, opts, log = () => {}) {
  const newsId = opts.newsId;
  if (newsId === null || newsId === undefined || newsId === "") {
    return { queued: false, reason: "missing_news_id" };
  }

  const eligibility = evaluateFacebookEligibility({
    category: opts.category,
    featured: opts.featured,
    createdAt: opts.createdAt
  });
  if (!eligibility.ok) {
    log("info", "Facebook: skipped (not important)", {
      newsId,
      reason: eligibility.reason,
      category: opts.category || null,
      featured: Boolean(opts.featured)
    });
    return { queued: false, reason: eligibility.reason };
  }

  if (wasFacebookPosted(newsId)) {
    return { queued: false, reason: "already_posted_state" };
  }

  const postText = buildQueuedFacebookText({
    facebookPost: opts.facebookPost,
    hashtags: opts.hashtags,
    newsId,
    imageCredit: opts.imageCredit
  });

  if (!postText.trim()) {
    return { queued: false, reason: "empty_post_text" };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("facebook_queue")
    .select("id, scheduled_at, status, fb_post_id, post_text, image_url, news_id")
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
    // Retry native schedule if we only saved locally before.
    if (
      (existing.status === "pending" || existing.status === "failed") &&
      !existing.fb_post_id
    ) {
      try {
        const scheduled = await scheduleRowOnFacebook(
          supabase,
          existing,
          opts.updatePublishStatus,
          log
        );
        if (scheduled.ok) {
          return {
            queued: true,
            scheduledAt: scheduled.scheduledAt,
            fbPostId: scheduled.id,
            native: true
          };
        }
        return {
          queued: false,
          reason: scheduled.reason || "schedule_skipped",
          scheduledAt: existing.scheduled_at
        };
      } catch (err) {
        await supabase
          .from("facebook_queue")
          .update({
            status: "failed",
            error: String(err.message || err).slice(0, 500)
          })
          .eq("id", existing.id);
        log("warn", "Facebook native schedule retry failed", {
          newsId,
          message: err.message
        });
        return { queued: false, reason: err.message };
      }
    }

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
    .select("id, scheduled_at, status, post_text, image_url, news_id, fb_post_id")
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

  log("info", "Facebook queue: enqueued locally", {
    newsId,
    scheduledAt: data.scheduled_at
  });

  try {
    const scheduled = await scheduleRowOnFacebook(
      supabase,
      data,
      opts.updatePublishStatus,
      log
    );
    if (scheduled.ok) {
      return {
        queued: true,
        scheduledAt: scheduled.scheduledAt,
        fbPostId: scheduled.id,
        native: true
      };
    }
    return {
      queued: true,
      scheduledAt: data.scheduled_at,
      reason: scheduled.reason || "schedule_deferred",
      native: false
    };
  } catch (err) {
    await supabase
      .from("facebook_queue")
      .update({
        status: "failed",
        error: String(err.message || err).slice(0, 500)
      })
      .eq("id", data.id);
    log("warn", "Facebook native schedule failed", {
      newsId,
      message: err.message
    });
    return { queued: false, reason: err.message, scheduledAt: data.scheduled_at };
  }
}

/**
 * Backfill Admin / orphan news into native Facebook schedule.
 */
export async function enqueueMissingNewsForFacebook(supabase, opts = {}, log = () => {}) {
  const limit = opts.limit ?? envInt("FACEBOOK_QUEUE_BACKFILL_LIMIT", 10);

  const { data: newsRows, error } = await supabase
    .from("news")
    .select(
      "id, facebook_post, urdu_summary, urdu_title, hashtags, image_url, image_credit, fb_post_id, category, featured, created_at"
    )
    .is("fb_post_id", null)
    .order("id", { ascending: false })
    .limit(Math.max(limit * 8, 80));

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

  const candidates = newsRows
    .filter((r) => !queuedSet.has(String(r.id)) && !wasFacebookPosted(r.id))
    .filter((r) =>
      evaluateFacebookEligibility({
        category: r.category,
        featured: r.featured,
        createdAt: r.created_at
      }).ok
    )
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
        imageUrl: row.image_url || "",
        imageCredit: row.image_credit || "",
        category: row.category,
        featured: row.featured,
        createdAt: row.created_at,
        updatePublishStatus: opts.updatePublishStatus
      },
      log
    );
    if (result.queued && result.native) added += 1;
  }

  if (added > 0) {
    log("info", "Facebook: backfilled native schedules", { added });
  }

  return added;
}

/**
 * Retry pending/failed queue rows that are not yet on Facebook Scheduled.
 * Also mark past `scheduled` rows as `posted` (FB already went live).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(newsId: number|string, publishResults: object) => Promise<void>} updatePublishStatus
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function processFacebookQueue(supabase, updatePublishStatus, log = () => {}) {
  const maxPerRun = envInt("FACEBOOK_MAX_SCHEDULES_PER_RUN", 10);
  const nowIso = new Date().toISOString();

  // Mark schedules whose time has passed as posted (FB already published them).
  await supabase
    .from("facebook_queue")
    .update({ status: "posted", posted_at: nowIso })
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .not("fb_post_id", "is", null);

  const { data: due, error } = await supabase
    .from("facebook_queue")
    .select("id, news_id, post_text, image_url, scheduled_at, status, fb_post_id")
    .in("status", ["pending", "failed"])
    .is("fb_post_id", null)
    .order("scheduled_at", { ascending: true })
    .limit(maxPerRun);

  if (error) {
    log("warn", "facebook_queue process: select failed", { message: error.message });
    return { posted: 0, failed: 0, skipped: 0, scheduled: 0 };
  }

  let scheduled = 0;
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

    // Ensure schedule time still meets Meta's +10 minute rule.
    const schedMs = Date.parse(row.scheduled_at);
    const minMs = Date.now() + FACEBOOK_MIN_SCHEDULE_AHEAD_MS;
    const effectiveAt =
      Number.isFinite(schedMs) && schedMs >= minMs
        ? new Date(schedMs)
        : new Date(minMs);

    try {
      const result = await scheduleRowOnFacebook(
        supabase,
        { ...row, scheduled_at: effectiveAt.toISOString() },
        updatePublishStatus,
        log
      );
      if (result.ok) {
        scheduled += 1;
      } else if (result.skipped) {
        skipped += 1;
        log("info", "Facebook schedule deferred by throttle", {
          newsId: row.news_id,
          reason: result.reason
        });
      }
    } catch (err) {
      failed += 1;
      await supabase
        .from("facebook_queue")
        .update({
          status: "failed",
          error: String(err.message || err).slice(0, 500)
        })
        .eq("id", row.id);
      log("warn", "Facebook native schedule failed", {
        newsId: row.news_id,
        message: err.message
      });
    }
  }

  return { posted: 0, failed, skipped, scheduled };
}

/**
 * After a Feed post goes live (`status=posted`), publish a Page Photo Story.
 * Does not fail the feed path — errors are logged on the queue row.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function processFacebookStories(supabase, log = () => {}) {
  if (!isFacebookStoriesEnabled()) {
    return { posted: 0, failed: 0, skipped: 0, disabled: true };
  }

  const maxPerRun = envInt("FACEBOOK_MAX_STORIES_PER_RUN", 5);
  const nowIso = new Date().toISOString();

  // Promote due schedules so stories can run in the same bot pass.
  await supabase
    .from("facebook_queue")
    .update({ status: "posted", posted_at: nowIso })
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .not("fb_post_id", "is", null);

  const { data: due, error } = await supabase
    .from("facebook_queue")
    .select("id, news_id, image_url, status, fb_story_id, scheduled_at")
    .eq("status", "posted")
    .is("fb_story_id", null)
    .not("image_url", "is", null)
    .order("posted_at", { ascending: true })
    .limit(maxPerRun);

  if (error) {
    // Older DBs may not have story columns yet — soft warn.
    log("warn", "facebook_queue stories: select failed", { message: error.message });
    return { posted: 0, failed: 0, skipped: 0, error: error.message };
  }

  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due || []) {
    if (!String(row.image_url || "").trim()) {
      skipped += 1;
      continue;
    }

    try {
      const result = await publishFacebookPhotoStory({ imageUrl: row.image_url });
      if (result.skipped) {
        skipped += 1;
        await supabase
          .from("facebook_queue")
          .update({
            story_error: String(result.reason || "skipped").slice(0, 500)
          })
          .eq("id", row.id);
        continue;
      }

      await supabase
        .from("facebook_queue")
        .update({
          fb_story_id: result.id,
          story_posted_at: new Date().toISOString(),
          story_error: null
        })
        .eq("id", row.id);

      posted += 1;
      log("info", "Facebook: photo story published", {
        newsId: row.news_id,
        storyId: result.id
      });
    } catch (err) {
      failed += 1;
      await supabase
        .from("facebook_queue")
        .update({
          story_error: String(err.message || err).slice(0, 500)
        })
        .eq("id", row.id);
      log("warn", "Facebook story publish failed", {
        newsId: row.news_id,
        message: err.message
      });
    }
  }

  return { posted, failed, skipped };
}
