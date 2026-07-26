import { publishToFacebook } from "./facebook.js";
import { publishToTelegram } from "./telegram.js";
import { publishToWhatsApp } from "./whatsapp.js";
import { publishToX } from "./x.js";

const CHANNELS = [
  {
    name: "facebook",
    publish: publishToFacebook,
    requiredEnv: ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]
  },
  {
    name: "telegram",
    publish: publishToTelegram,
    requiredEnv: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
  },
  {
    name: "whatsapp",
    publish: publishToWhatsApp,
    requiredEnv: [
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_TEMPLATE_NAME",
      "WHATSAPP_RECIPIENT_NUMBERS"
    ]
  },
  {
    name: "x",
    publish: publishToX,
    requiredEnv: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]
  }
];

function isChannelConfigured(channel) {
  return channel.requiredEnv.every((key) => Boolean(process.env[key]));
}

/**
 * Attempts to publish `payload` to every configured channel.
 *
 * Each channel is independent and fail-soft:
 * - A channel missing its required env vars is skipped silently
 *   (`{ published: false, skipped: true }`) — so the bot works unchanged
 *   for anyone who hasn't configured that channel yet.
 * - A channel that's configured but fails (bad token, API error, network
 *   issue) is caught and reported (`{ published: false, error }`), never
 *   thrown — one failing channel never blocks the others, and publishing
 *   never fails the underlying item, which is already saved to the
 *   database regardless of publish outcome.
 *
 * @param {object} payload - See individual publisher modules for the exact fields each one reads.
 * @returns {Promise<Record<string, { published: boolean, id?: string, skipped?: boolean, error?: string, partialErrors?: string[] }>>}
 */
export async function publishAll(payload) {
  const results = {};

  for (const channel of CHANNELS) {
    if (!isChannelConfigured(channel)) {
      results[channel.name] = { published: false, skipped: true };
      continue;
    }

    try {
      results[channel.name] = await channel.publish(payload);
    } catch (error) {
      results[channel.name] = { published: false, error: error.message };
    }
  }

  return results;
}
