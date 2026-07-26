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
 * @returns {string[]} configured channel names
 */
export function listConfiguredChannels() {
  return CHANNELS.filter(isChannelConfigured).map((channel) => channel.name);
}

/**
 * Attempts to publish `payload` to configured channels.
 *
 * @param {object} payload
 * @param {{ onlyChannels?: string[] }} [options] - If set, only these channels
 *   are attempted (used by Phase 9 publish retry for missing channels).
 * @returns {Promise<Record<string, { published: boolean, id?: string, skipped?: boolean, error?: string, partialErrors?: string[] }>>}
 */
export async function publishAll(payload, options = {}) {
  const results = {};
  const only = Array.isArray(options.onlyChannels)
    ? new Set(options.onlyChannels.map(String))
    : null;

  for (const channel of CHANNELS) {
    if (only && !only.has(channel.name)) {
      results[channel.name] = { published: false, skipped: true };
      continue;
    }

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
