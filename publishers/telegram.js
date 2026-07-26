/**
 * Telegram Bot API publisher.
 *
 * Requires: TELEGRAM_BOT_TOKEN (from @BotFather), TELEGRAM_CHAT_ID
 * (the target channel, e.g. "@my_channel", or a numeric chat id — the
 * bot must be added to the channel as an admin with post permission).
 */

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
// Telegram's own limits: sendPhoto captions are capped at 1024 chars,
// sendMessage text at 4096 — trimmed defensively well under both.
const MAX_CAPTION_LENGTH = 1000;

function buildCaption({ urduTitle, urduSummary, hashtags, sourceUrl }) {
  const parts = [urduTitle, urduSummary, hashtags, sourceUrl].filter(Boolean);
  return parts.join("\n\n").slice(0, MAX_CAPTION_LENGTH);
}

/**
 * Publishes a news item to a Telegram channel via the Bot API.
 *
 * If an image URL is available, sends it via `sendPhoto` with a caption;
 * otherwise sends a plain `sendMessage`.
 *
 * @param {object} payload
 * @param {string} payload.urduTitle
 * @param {string} payload.urduSummary
 * @param {string} [payload.hashtags]
 * @param {string} [payload.imageUrl]
 * @param {string} [payload.sourceUrl]
 * @returns {Promise<{ published: true, id: string }>}
 * @throws {Error} If required env vars are missing, the request fails, or Telegram returns an error.
 */
export async function publishToTelegram({ urduTitle, urduSummary, hashtags, imageUrl, sourceUrl }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set");
  }

  const caption = buildCaption({ urduTitle, urduSummary, hashtags, sourceUrl });
  if (!caption) {
    throw new Error("publishToTelegram: no content to send");
  }

  const usePhoto = Boolean(imageUrl);
  const method = usePhoto ? "sendPhoto" : "sendMessage";
  const endpoint = `${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`;

  const body = usePhoto
    ? { chat_id: chatId, photo: imageUrl, caption }
    : { chat_id: chatId, text: caption };

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (networkError) {
    throw new Error(`Telegram request failed (network error): ${networkError.message}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram API error (HTTP ${response.status}): ${data?.description || response.statusText}`
    );
  }

  const messageId = data.result?.message_id;
  if (!messageId) {
    throw new Error("Telegram API response missing a message id");
  }

  return { published: true, id: String(messageId) };
}
