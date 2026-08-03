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

/**
 * Per-channel kill switches (default: telegram + x OFF for now).
 * Set PUBLISH_TELEGRAM=true / PUBLISH_X=true to re-enable.
 */
function isChannelPublishingEnabled(name) {
  const envKey = `PUBLISH_${String(name).toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") {
    if (name === "telegram" || name === "x") return false;
    return true;
  }
  return !["0", "false", "no", "off"].includes(String(raw).toLowerCase());
}

function isChannelConfigured(channel) {
  return channel.requiredEnv.every((key) => Boolean(process.env[key]));
}

/**
 * @returns {string[]} configured channel names
 */
export function listConfiguredChannels() {
  return CHANNELS.filter(
    (channel) => isChannelConfigured(channel) && isChannelPublishingEnabled(channel.name)
  ).map((channel) => channel.name);
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

    if (!isChannelPublishingEnabled(channel.name)) {
      results[channel.name] = {
        published: false,
        skipped: true,
        reason: `publish_${channel.name}_disabled`
      };
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
