/**
 * Telegram Bot API helpers for inbound editor ingest (getUpdates polling).
 */

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return token;
}

/**
 * @param {string} method
 * @param {object} [body]
 */
export async function telegramApi(method, body) {
  const endpoint = `${TELEGRAM_API_BASE_URL}/bot${botToken()}/${method}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(
      `Telegram ${method} failed (HTTP ${response.status}): ${data?.description || response.statusText}`
    );
  }
  return data.result;
}

export async function telegramDeleteWebhook() {
  return telegramApi("deleteWebhook", { drop_pending_updates: false });
}

/**
 * @param {number} [offset]
 * @param {number} [limit]
 */
export async function telegramGetUpdates(offset, limit = 50) {
  const body = {
    timeout: 0,
    limit,
    allowed_updates: ["message"]
  };
  if (Number.isFinite(offset)) body.offset = offset;
  return telegramApi("getUpdates", body);
}

/**
 * @param {number|string} chatId
 * @param {string} text
 * @param {number} [replyToMessageId]
 */
export async function telegramSendMessage(chatId, text, replyToMessageId) {
  const body = {
    chat_id: chatId,
    text: String(text || "").slice(0, 4000),
    disable_web_page_preview: true
  };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  return telegramApi("sendMessage", body);
}

/**
 * @param {string} fileId
 * @returns {Promise<string>} absolute file URL for download
 */
export async function telegramFileUrl(fileId) {
  const file = await telegramApi("getFile", { file_id: fileId });
  if (!file?.file_path) {
    throw new Error("Telegram getFile missing file_path");
  }
  return `${TELEGRAM_API_BASE_URL}/file/bot${botToken()}/${file.file_path}`;
}
