/**
 * Delete all Page scheduled posts + cancel local facebook_queue open rows.
 *
 * Env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional)
 */

import { createClient } from "@supabase/supabase-js";

const API = "https://graph.facebook.com/v21.0";
const DELETE_CONCURRENCY = 5;
const MAX_ROUNDS = 30;

function log(level, message, meta) {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  console.log(`[${level.toUpperCase()}] ${line}`);
}

async function fetchJson(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function listScheduledPostIds(pageId, token) {
  const ids = [];
  const q = `access_token=${encodeURIComponent(token)}&limit=100&fields=id,scheduled_publish_time`;
  let cursor = `${API}/${pageId}/scheduled_posts?${q}`;
  let pages = 0;

  while (cursor && pages < 40) {
    pages += 1;
    log("info", "Fetching schedule page", { page: pages });
    const data = await fetchJson(cursor);
    for (const row of data.data || []) {
      if (row.id) ids.push(String(row.id));
    }
    cursor = data.paging?.next || null;
  }

  return ids;
}

async function deletePost(id, token) {
  const url = `${API}/${id}?access_token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { method: "DELETE", signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(t);
  }
}

async function deleteAll(ids, token) {
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += DELETE_CONCURRENCY) {
    const batch = ids.slice(i, i + DELETE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => deletePost(id, token))
    );
    for (let j = 0; j < results.length; j++) {
      const id = batch[j];
      if (results[j].status === "fulfilled") {
        deleted += 1;
        log("info", "Deleted", { id, n: deleted });
      } else {
        failed += 1;
        log("warn", "Delete failed", {
          id,
          message: results[j].reason?.message || String(results[j].reason)
        });
      }
    }
  }

  return { deleted, failed };
}

async function clearLocalQueue() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log("info", "Supabase not configured — skip local queue cleanup");
    return { updated: 0 };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: openRows, error: listErr } = await supabase
    .from("facebook_queue")
    .select("id, news_id")
    .in("status", ["pending", "failed", "scheduled"]);

  if (listErr) {
    log("warn", "local queue list failed", { message: listErr.message });
    return { updated: 0, error: listErr.message };
  }

  const newsIds = [
    ...new Set((openRows || []).map((r) => r.news_id).filter(Boolean))
  ];

  const { data, error } = await supabase
    .from("facebook_queue")
    .update({
      status: "cancelled",
      error: "cleared_all_scheduled",
      fb_post_id: null
    })
    .in("status", ["pending", "failed", "scheduled"])
    .select("id");

  if (error) {
    log("warn", "local queue cleanup failed", { message: error.message });
    return { updated: 0, error: error.message };
  }

  if (newsIds.length > 0) {
    const { error: newsErr } = await supabase
      .from("news")
      .update({ fb_post_id: null })
      .in("id", newsIds);
    if (newsErr) {
      log("warn", "news.fb_post_id clear failed", { message: newsErr.message });
    } else {
      log("info", "news.fb_post_id cleared for re-schedule", {
        count: newsIds.length
      });
    }
  }

  log("info", "local facebook_queue cancelled", {
    updated: (data || []).length
  });
  return { updated: (data || []).length, newsCleared: newsIds.length };
}

async function main() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN are required");
  }

  log("info", "Clearing Facebook scheduled posts…", { pageId });

  let totalDeleted = 0;
  let totalFailed = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const ids = await listScheduledPostIds(pageId, token);
    log("info", "Found posts to delete", { round, count: ids.length });
    if (ids.length === 0) break;

    const { deleted, failed } = await deleteAll(ids, token);
    totalDeleted += deleted;
    totalFailed += failed;

    if (deleted === 0) {
      log("warn", "No deletes succeeded this round — stopping", { round });
      break;
    }
  }

  const local = await clearLocalQueue();
  log("info", "Done", {
    deleted: totalDeleted,
    failed: totalFailed,
    localCancelled: local.updated
  });

  if (totalDeleted === 0 && totalFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
