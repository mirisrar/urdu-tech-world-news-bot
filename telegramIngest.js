/**
 * Phase 1 — Telegram editor ingest via GitHub Actions polling.
 *
 * Each news.yml run:
 *   1. deleteWebhook (so getUpdates works)
 *   2. getUpdates from saved offset
 *   3. Allowlist TELEGRAM_EDITOR_IDS
 *   4. Save photo + caption/text into telegram_inbox (pending)
 *   5. Reply acknowledge (processing comes in Phase 2+)
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

function helpText() {
  return [
    "Nexora News — Editor bot",
    "",
    "Send ONE message:",
    "• Photo + caption = title (or full article text)",
    "",
    "Bot will (next run, ~5 min):",
    "• Save to website",
    "• Post Facebook Feed + Story (immediate)",
    "",
    "Only allowlisted editors can post."
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

    // /start or /help
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

    if (!photoFileId) {
      try {
        await telegramSendMessage(
          chatId,
          "📷 Please send a photo with caption (title or full article).",
          messageId
        );
      } catch {
        /* ignore */
      }
      ignored += 1;
      continue;
    }

    const bodyText = caption || text;
    if (!bodyText) {
      try {
        await telegramSendMessage(
          chatId,
          "✏️ Add a caption: news title (or full article text).",
          messageId
        );
      } catch {
        /* ignore */
      }
      ignored += 1;
      continue;
    }

    const row = {
      update_id: updateId,
      chat_id: chatId,
      user_id: userId,
      username,
      message_id: messageId,
      photo_file_id: photoFileId,
      caption: caption || null,
      text_body: bodyText,
      status: "pending"
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
      await telegramSendMessage(
        chatId,
        "✅ Received. Will publish to website + Facebook within ~5 minutes.",
        messageId
      );
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
