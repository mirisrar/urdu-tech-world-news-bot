/**
 * Phase 2 — Process telegram_inbox → AI → website → Facebook Feed (immediate).
 *
 * Editor submissions always go to Facebook (no important-category filter, no schedule).
 */

import { analyzeNews } from "./ai_agent.js";
import { storeRemoteImage } from "./imagePipeline.js";
import {
  buildWebsiteArticleUrl,
  publishToFacebook
} from "./publishers/facebook.js";
import { markFacebookPosted } from "./publishState.js";
import { telegramFileUrl, telegramSendMessage } from "./telegramApi.js";

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Split editor caption into title + body source for Gemini.
 * @param {string} text
 */
export function splitEditorText(text) {
  const t = String(text || "").trim();
  const lines = t
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { title: "Untitled", body: "" };
  }
  if (lines.length === 1) {
    if (t.length <= 160) return { title: t, body: t };
    return { title: t.slice(0, 120).trim(), body: t };
  }
  return {
    title: lines[0].slice(0, 200),
    body: lines.slice(1).join("\n\n")
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} row
 * @param {object} aiResult
 * @param {string} imageUrl
 */
async function insertEditorNews(supabase, row, aiResult, imageUrl) {
  const newsRow = {
    title: splitEditorText(row.text_body || row.caption || "").title,
    source: "Telegram Editor",
    url: `telegram-editor://${row.update_id}`,
    category: aiResult.category || "Pakistan",
    urdu_title: aiResult.urduTitle,
    urdu_summary: aiResult.urduSummary,
    seo_title: aiResult.seoTitle,
    seo_description: aiResult.seoDescription || aiResult.urduSummary || "",
    seo_keywords: aiResult.seoKeywords || "",
    article: aiResult.article,
    hashtags: aiResult.hashtags,
    facebook_post: aiResult.facebookPost,
    image_prompt: "",
    image_url: imageUrl,
    image_credit: "Photo: Editor",
    featured: false
  };

  // Strip missing columns gracefully (same idea as index.js writeWithColumnFallback).
  let current = { ...newsRow };
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await supabase
      .from("news")
      .insert(current)
      .select("id")
      .single();

    if (!error) return data.id;

    const missing = error.message?.match(/column "(\w+)"/i)?.[1];
    if (error.code === "42703" && missing && missing in current) {
      const { [missing]: _omit, ...rest } = current;
      current = rest;
      continue;
    }
    throw new Error(error.message);
  }
  throw new Error("insertEditorNews: too many missing columns");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {number|string} newsId
 * @param {object} patch
 */
async function patchNews(supabase, newsId, patch) {
  const { error } = await supabase.from("news").update(patch).eq("id", newsId);
  if (error) {
    // Non-fatal — article already live.
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/**
 * Process pending telegram_inbox rows.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function processTelegramInbox(supabase, log = () => {}) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { processed: 0, failed: 0, skipped: 0, reason: "no_token" };
  }

  const limit = envInt("TELEGRAM_PUBLISH_MAX_PER_RUN", 5);

  const { data: pending, error } = await supabase
    .from("telegram_inbox")
    .select(
      "id, update_id, chat_id, user_id, message_id, photo_file_id, caption, text_body, status"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    log("warn", "telegram_inbox select failed", { message: error.message });
    return { processed: 0, failed: 0, skipped: 0, error: error.message };
  }

  if (!pending?.length) {
    return { processed: 0, failed: 0, skipped: 0 };
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    const { data: claimed, error: claimErr } = await supabase
      .from("telegram_inbox")
      .update({ status: "processing", error: null })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");

    if (claimErr || !claimed?.length) {
      skipped += 1;
      continue;
    }

    try {
      if (!row.photo_file_id) {
        throw new Error("missing_photo_file_id");
      }

      const fileUrl = await telegramFileUrl(row.photo_file_id);
      const imageUrl = await storeRemoteImage(
        supabase,
        fileUrl,
        `tg-${row.update_id}`,
        log
      );

      // Multi-line editor text: line 1 = title, rest = full article source for Gemini.
      const rawEditor = String(row.text_body || row.caption || "").trim();
      const { title, body } = splitEditorText(rawEditor);
      const sourceForAi = body || rawEditor || title;
      const aiResult = await analyzeNews(
        {
          title,
          rawContent: sourceForAi,
          description: sourceForAi
        },
        log
      );

      const newsId = await insertEditorNews(supabase, row, aiResult, imageUrl);
      const websiteUrl = buildWebsiteArticleUrl(newsId);

      // Facebook Feed — immediate (no schedule). No Story posting.
      let fbPostId = "";
      let fbNote = "";

      if (process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
        const fbResult = await publishToFacebook({
          facebookPost: aiResult.facebookPost || aiResult.urduSummary,
          hashtags: aiResult.hashtags,
          imageUrl,
          imageCredit: "Photo: Editor",
          newsId,
          websiteUrl,
          immediate: true
        });

        if (fbResult.skipped) {
          fbNote = `FB deferred: ${fbResult.reason}`;
          log("warn", "Telegram editor: Facebook skipped", {
            newsId,
            reason: fbResult.reason
          });
        } else if (fbResult.published) {
          fbPostId = fbResult.id;
          markFacebookPosted(newsId, fbPostId);
          await patchNews(supabase, newsId, {
            fb_post_id: fbPostId,
            published_at: new Date().toISOString()
          });
        }
      } else {
        fbNote = "Facebook not configured";
      }

      await supabase
        .from("telegram_inbox")
        .update({
          status: "done",
          news_id: newsId,
          processed_at: new Date().toISOString(),
          error: fbNote ? fbNote.slice(0, 500) : null
        })
        .eq("id", row.id);

      const replyLines = [
        "✅ Published",
        websiteUrl || `news id=${newsId}`,
        fbPostId ? `Facebook: ${fbPostId}` : fbNote || "Facebook: pending"
      ].filter(Boolean);

      try {
        await telegramSendMessage(row.chat_id, replyLines.join("\n"), row.message_id);
      } catch (replyErr) {
        log("warn", "Telegram success reply failed", { message: replyErr.message });
      }

      processed += 1;
      log("info", "Telegram editor published", {
        newsId,
        fbPostId: fbPostId || null
      });
    } catch (err) {
      failed += 1;
      const msg = String(err.message || err).slice(0, 500);
      await supabase
        .from("telegram_inbox")
        .update({
          status: "failed",
          error: msg,
          processed_at: new Date().toISOString()
        })
        .eq("id", row.id);

      try {
        await telegramSendMessage(
          row.chat_id,
          `⚠️ Publish failed:\n${msg.slice(0, 300)}`,
          row.message_id
        );
      } catch {
        /* ignore */
      }

      log("warn", "Telegram editor publish failed", {
        inboxId: row.id,
        message: err.message
      });
    }
  }

  return { processed, failed, skipped };
}
