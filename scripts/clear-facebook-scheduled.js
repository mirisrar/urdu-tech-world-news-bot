/**
 * Delete all unpublished / scheduled posts on the Facebook Page.
 * Cancels local facebook_queue rows (pending / failed / scheduled).
 *
 * Env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional)
 */

import { createClient } from "@supabase/supabase-js";

const API = "https://graph.facebook.com/v21.0";

function log(level, message, meta) {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  console.log(`[${level.toUpperCase()}] ${line}`);
}

async function fetchAll(url) {
  const ids = [];
  let cursor = url;
  while (cursor) {
    const res = await fetch(cursor);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
    for (const row of data.data || []) {
      if (row.id) ids.push(String(row.id));
    }
    cursor = data.paging?.next || null;
  }
  return ids;
}

async function listScheduledPostIds(pageId, token) {
  const ids = new Set();
  const q = `access_token=${encodeURIComponent(token)}&limit=100`;

  try {
    const a = await fetchAll(
      `${API}/${pageId}/scheduled_posts?fields=id,scheduled_publish_time&${q}`
    );
    a.forEach((id) => ids.add(id));
    log("info", "scheduled_posts", { count: a.length });
  } catch (err) {
    log("warn", "scheduled_posts failed", { message: err.message });
  }

  try {
    const b = await fetchAll(
      `${API}/${pageId}/promotable_posts?is_published=false&fields=id,is_published,scheduled_publish_time&${q}`
    );
    b.forEach((id) => ids.add(id));
    log("info", "unpublished promotable_posts", { count: b.length });
  } catch (err) {
    log("warn", "promotable_posts failed", { message: err.message });
  }

  return [...ids];
}

async function deletePost(id, token) {
  const url = `${API}/${id}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
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

  const newsIds = [...new Set((openRows || []).map((r) => r.news_id).filter(Boolean))];

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

  // Allow re-schedule of wiped items (important catch-up / new runs).
  if (newsIds.length > 0) {
    const { error: newsErr } = await supabase
      .from("news")
      .update({ fb_post_id: null })
      .in("id", newsIds);
    if (newsErr) {
      log("warn", "news.fb_post_id clear failed", { message: newsErr.message });
    } else {
      log("info", "news.fb_post_id cleared for re-schedule", { count: newsIds.length });
    }
  }

  log("info", "local facebook_queue cancelled", { updated: (data || []).length });
  return { updated: (data || []).length, newsCleared: newsIds.length };
}

async function main() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN are required");
  }

  log("info", "Clearing Facebook scheduled posts…", { pageId });
  const ids = await listScheduledPostIds(pageId, token);
  log("info", "Found posts to delete", { count: ids.length });

  let deleted = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await deletePost(id, token);
      deleted += 1;
      log("info", "Deleted", { id });
    } catch (err) {
      failed += 1;
      log("warn", "Delete failed", { id, message: err.message });
    }
  }

  const local = await clearLocalQueue();
  log("info", "Done", { deleted, failed, localCancelled: local.updated });

  if (ids.length > 0 && deleted === 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
