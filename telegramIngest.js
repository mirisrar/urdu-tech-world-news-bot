/**
 * Phase 1 — Telegram editor ingest via GitHub Actions polling.
 *
 * Multi-line article flow:
 *   1. Photo (+ optional short title caption) → draft
 *   2. One or more text messages → append to draft, then pending
 *   3. Photo + long multi-line caption → pending immediately (one message)
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN          (required)
 *   TELEGRAM_EDITOR_IDS         comma-separated Telegram user ids
 *   TELEGRAM_INGEST_ENABLED     default true when EDITOR_IDS set
 */

import {
  telegramDeleteWebhook,
  telegramGetUpdates,
  telegramSendMessage
} from "./telegramApi.js";

const OFFSET_KEY = "update_offset";
/** Caption/body long enough to publish without a follow-up text message. */
const SUBSTANTIAL_BODY_CHARS = 120;

function envFlag(name, defaultTrue = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultTrue;
  return !["0", "false", "no", "off"].includes(String(raw).toLowerCase());
}

/** @returns {Set<string>} */
export function getTelegramEditorIds() {
  const raw = String(process.env.TELEGRAM_EDITOR_IDS || "");
  return new Set(
    raw
      .split(/[,|\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isTelegramIngestEnabled() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;
  if (!envFlag("TELEGRAM_INGEST_ENABLED", true)) return false;
  return getTelegramEditorIds().size > 0;
}

/**
 * Largest photo file_id from a Telegram message.
 * @param {object} message
 * @returns {string}
 */
export function extractPhotoFileId(message) {
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  if (photos.length === 0) return "";
  const best = photos[photos.length - 1];
  return String(best?.file_id || "");
}

/**
 * True when caption alone is enough for a full article package.
 * @param {string} text
 */
export function isSubstantialEditorBody(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && t.length >= 80) return true;
  return t.length >= SUBSTANTIAL_BODY_CHARS;
}

/**
 * Merge title/caption + follow-up article lines.
 * @param {string} existing
 * @param {string} incoming
 */
export function mergeEditorBodies(existing, incoming) {
  const a = String(existing || "").trim();
  const b = String(incoming || "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  return `${a}\n\n${b}`;
}

function helpText() {
  return [
    "Nexora News — Editor bot",
    "",
    "Multi-line article (recommended):",
    "1) Send PHOTO (caption = title, optional)",
    "2) Send TEXT message = full article (multi-line OK)",
    "   You can send more text messages — they append.",
    "",
    "OR one message:",
    "• Photo + long multi-line caption (Telegram max ~1024 chars)",
    "",
    "Commands: /done  /cancel  /help",
    "",
    "Bot (next run ~5 min): website + Facebook Feed"
  ].join("\n");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<number>}
 */
async function loadOffset(supabase) {
  const { data, error } = await supabase
    .from("telegram_bot_state")
    .select("value")
    .eq("key", OFFSET_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`telegram_bot_state read failed: ${error.message}`);
  }
  const n = Number.parseInt(String(data?.value || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {number} offset
 */
async function saveOffset(supabase, offset) {
  const { error } = await supabase.from("telegram_bot_state").upsert(
    {
      key: OFFSET_KEY,
      value: String(offset),
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );
  if (error) {
    throw new Error(`telegram_bot_state write failed: ${error.message}`);
  }
}

/**
 * Latest open draft/pending row with a photo for this editor.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {number|string} userId
 */
async function findOpenEditorDraft(supabase, userId) {
  const { data, error } = await supabase
    .from("telegram_inbox")
    .select("id, text_body, caption, status, photo_file_id, created_at")
    .eq("user_id", userId)
    .in("status", ["draft", "pending"])
    .not("photo_file_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`telegram_inbox draft lookup failed: ${error.message}`);
  }
  return data || null;
}

/**
 * Poll Telegram and enqueue editor submissions.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function ingestTelegramEditorMessages(supabase, log = () => {}) {
  if (!isTelegramIngestEnabled()) {
    log("info", "Telegram ingest skipped", {
      reason: !process.env.TELEGRAM_BOT_TOKEN
        ? "no_token"
        : getTelegramEditorIds().size === 0
          ? "no_TELEGRAM_EDITOR_IDS"
          : "disabled"
    });
    return { fetched: 0, accepted: 0, ignored: 0, failed: 0 };
  }

  const editors = getTelegramEditorIds();

  try {
    await telegramDeleteWebhook();
  } catch (err) {
    log("warn", "Telegram deleteWebhook failed (continuing)", {
      message: err.message
    });
  }

  let offset = 0;
  try {
    offset = await loadOffset(supabase);
  } catch (err) {
    log("warn", "Telegram ingest: offset table missing?", { message: err.message });
    return { fetched: 0, accepted: 0, ignored: 0, failed: 0, error: err.message };
  }

  let updates = [];
  try {
    updates = (await telegramGetUpdates(offset || undefined)) || [];
  } catch (err) {
    log("warn", "Telegram getUpdates failed", { message: err.message });
    return { fetched: 0, accepted: 0, ignored: 0, failed: 0, error: err.message };
  }

  let accepted = 0;
  let ignored = 0;
  let failed = 0;
  let maxUpdateId = offset;

  for (const update of updates) {
    const updateId = Number(update.update_id);
    if (Number.isFinite(updateId) && updateId >= maxUpdateId) {
      maxUpdateId = updateId + 1;
    }

    const message = update.message;
    if (!message) {
      ignored += 1;
      continue;
    }

    const chatId = message.chat?.id;
    const userId = message.from?.id;
    const username = message.from?.username || null;
    const messageId = message.message_id;
    const text = String(message.text || "").trim();
    const caption = String(message.caption || "").trim();
    const photoFileId = extractPhotoFileId(message);

    if (/^\/(start|help)\b/i.test(text)) {
      try {
        await telegramSendMessage(chatId, helpText(), messageId);
      } catch {
        /* ignore */
      }
      ignored += 1;
      continue;
    }

    if (!editors.has(String(userId))) {
      try {
        await telegramSendMessage(
          chatId,
          "⛔ Not authorized. Ask admin to add your Telegram user id.",
          messageId
        );
      } catch {
        /* ignore */
      }
      ignored += 1;
      continue;
    }

    // /cancel — drop open draft
    if (/^\/cancel\b/i.test(text)) {
      try {
        const draft = await findOpenEditorDraft(supabase, userId);
        if (draft) {
          await supabase
            .from("telegram_inbox")
            .update({
              status: "ignored",
              error: "cancelled_by_editor",
              processed_at: new Date().toISOString()
            })
            .eq("id", draft.id);
          await telegramSendMessage(chatId, "🗑️ Draft cancelled.", messageId);
        } else {
          await telegramSendMessage(chatId, "No open draft to cancel.", messageId);
        }
      } catch (err) {
        failed += 1;
        log("warn", "Telegram /cancel failed", { message: err.message });
      }
      ignored += 1;
      continue;
    }

    // /done — mark draft ready for publish
    if (/^\/done\b/i.test(text)) {
      try {
        const draft = await findOpenEditorDraft(supabase, userId);
        if (!draft) {
          await telegramSendMessage(chatId, "No open draft. Send photo + article text.", messageId);
        } else if (!String(draft.text_body || draft.caption || "").trim()) {
          await telegramSendMessage(
            chatId,
            "✏️ Draft has no article text yet. Send the full multi-line article.",
            messageId
          );
        } else {
          await supabase
            .from("telegram_inbox")
            .update({ status: "pending", error: null })
            .eq("id", draft.id);
          await telegramSendMessage(
            chatId,
            "✅ Marked ready — publishing on next bot run (~5 min).",
            messageId
          );
          accepted += 1;
        }
      } catch (err) {
        failed += 1;
        log("warn", "Telegram /done failed", { message: err.message });
      }
      continue;
    }

    // Follow-up TEXT (multi-line article) → append to open photo draft
    if (!photoFileId && text) {
      try {
        const draft = await findOpenEditorDraft(supabase, userId);
        if (!draft) {
          await telegramSendMessage(
            chatId,
            "📷 First send a PHOTO (caption = title), then send the full article as text.",
            messageId
          );
          ignored += 1;
          continue;
        }

        const merged = mergeEditorBodies(draft.text_body || draft.caption || "", text);
        const { error } = await supabase
          .from("telegram_inbox")
          .update({
            text_body: merged,
            status: "pending",
            error: null
          })
          .eq("id", draft.id);

        if (error) {
          failed += 1;
          log("warn", "telegram_inbox text append failed", {
            draftId: draft.id,
            message: error.message
          });
          await telegramSendMessage(
            chatId,
            `⚠️ Could not save text.\n${error.message.slice(0, 120)}`,
            messageId
          );
          continue;
        }

        accepted += 1;
        await telegramSendMessage(
          chatId,
          [
            "✅ Article text saved (multi-line OK).",
            `Chars: ${merged.length}`,
            "More text? Send another message — it will append.",
            "Or wait ~5 min for website + Facebook publish.",
            "/cancel to drop this draft."
          ].join("\n"),
          messageId
        );
      } catch (err) {
        failed += 1;
        log("warn", "Telegram text follow-up failed", { message: err.message });
      }
      continue;
    }

    if (!photoFileId) {
      try {
        await telegramSendMessage(
          chatId,
          "📷 Send a photo first, then the full article as a text message (multi-line OK).",
          messageId
        );
      } catch {
        /* ignore */
      }
      ignored += 1;
      continue;
    }

    // New PHOTO submission
    const bodyText = caption || "";
    const readyNow = isSubstantialEditorBody(bodyText);
    const status = readyNow ? "pending" : "draft";

    const row = {
      update_id: updateId,
      chat_id: chatId,
      user_id: userId,
      username,
      message_id: messageId,
      photo_file_id: photoFileId,
      caption: caption || null,
      text_body: bodyText || null,
      status
    };

    const { error } = await supabase.from("telegram_inbox").upsert(row, {
      onConflict: "update_id",
      ignoreDuplicates: true
    });

    if (error) {
      failed += 1;
      log("warn", "telegram_inbox insert failed", {
        updateId,
        message: error.message
      });
      try {
        await telegramSendMessage(
          chatId,
          `⚠️ Could not save (DB). Try again later.\n${error.message.slice(0, 120)}`,
          messageId
        );
      } catch {
        /* ignore */
      }
      continue;
    }

    accepted += 1;
    try {
      if (readyNow) {
        await telegramSendMessage(
          chatId,
          "✅ Received (photo + caption) — publishing to website + Facebook (~5 min).",
          messageId
        );
      } else {
        await telegramSendMessage(
          chatId,
          [
            "✅ Photo saved as draft.",
            "Now send the FULL article as a TEXT message (multi-line OK).",
            "You can send several text messages — they append.",
            "/done when finished · /cancel to drop"
          ].join("\n"),
          messageId
        );
      }
    } catch (err) {
      log("warn", "Telegram ack reply failed", { message: err.message });
    }
  }

  if (maxUpdateId > offset) {
    try {
      await saveOffset(supabase, maxUpdateId);
    } catch (err) {
      log("warn", "Telegram offset save failed", { message: err.message });
    }
  }

  log("info", "Telegram ingest", {
    fetched: updates.length,
    accepted,
    ignored,
    failed,
    nextOffset: maxUpdateId
  });

  return { fetched: updates.length, accepted, ignored, failed };
}
