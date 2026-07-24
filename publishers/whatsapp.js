/**
 * WhatsApp Business Cloud API publisher.
 *
 * ⚠️ IMPORTANT SCOPE NOTE — read before configuring this:
 *
 * This does NOT post to a "WhatsApp Channel" (the public, Telegram-channel-
 * like broadcast feature in the WhatsApp app's Updates tab). As of 2026,
 * WhatsApp Channels have no official public API for programmatic posting —
 * only unofficial, ToS-risking reverse-engineered gateways claim to support
 * that (and using them risks the underlying account being banned), so this
 * project deliberately does not implement or depend on them.
 *
 * What IS officially, legitimately supported by Meta's public API is
 * sending pre-approved template messages to individual, opted-in recipients
 * via the WhatsApp Business Platform (Cloud API) — a private one-to-many
 * broadcast, not a public channel post. That's what this module does.
 * See PROJECT_ROADMAP.md Phase 4 for more context.
 *
 * Requires:
 * - WHATSAPP_PHONE_NUMBER_ID — your WhatsApp Business phone number's ID.
 * - WHATSAPP_ACCESS_TOKEN — a Meta access token with whatsapp_business_messaging.
 * - WHATSAPP_TEMPLATE_NAME — the name of a template already approved by
 *   Meta, with exactly one body variable ({{1}}).
 * - WHATSAPP_RECIPIENT_NUMBERS — comma-separated E.164 numbers (e.g.
 *   "+923001234567,+923009876543"), each of which must have opted in to
 *   receive messages per Meta's policy.
 */

const WHATSAPP_API_VERSION = "v21.0";
const MAX_BODY_TEXT_LENGTH = 1024;

function getConfig() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
    recipients: (process.env.WHATSAPP_RECIPIENT_NUMBERS || "")
      .split(",")
      .map((number) => number.trim())
      .filter(Boolean)
  };
}

async function sendToRecipient({ endpoint, accessToken, to, templateName, bodyText }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: bodyText }]
          }
        ]
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    throw new Error(data?.error?.message || response.statusText);
  }

  const messageId = data?.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response missing a message id");
  }

  return messageId;
}

/**
 * Sends a WhatsApp template message (see module notes above) to every
 * configured recipient. Succeeds if at least one recipient received the
 * message; per-recipient failures are collected and returned rather than
 * failing the whole call, since one bad/expired number shouldn't block
 * delivery to the others.
 *
 * @param {object} payload
 * @param {string} payload.urduTitle
 * @param {string} [payload.sourceUrl]
 * @returns {Promise<{ published: true, id: string, partialErrors?: string[] }>}
 * @throws {Error} If required env vars are missing or every recipient send fails.
 */
export async function publishToWhatsApp({ urduTitle, sourceUrl }) {
  const { phoneNumberId, accessToken, templateName, recipients } = getConfig();

  if (!phoneNumberId || !accessToken || !templateName || recipients.length === 0) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_TEMPLATE_NAME, and WHATSAPP_RECIPIENT_NUMBERS must all be set"
    );
  }

  const bodyText = [urduTitle, sourceUrl].filter(Boolean).join(" - ").slice(0, MAX_BODY_TEXT_LENGTH);
  if (!bodyText) {
    throw new Error("publishToWhatsApp: no content to send");
  }

  const endpoint = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const sentIds = [];
  const errors = [];

  for (const to of recipients) {
    try {
      const messageId = await sendToRecipient({ endpoint, accessToken, to, templateName, bodyText });
      sentIds.push(messageId);
    } catch (error) {
      errors.push(`${to}: ${error.message}`);
    }
  }

  if (sentIds.length === 0) {
    throw new Error(`WhatsApp send failed for all recipients: ${errors.join("; ")}`);
  }

  const result = { published: true, id: sentIds.join(",") };
  if (errors.length > 0) {
    result.partialErrors = errors;
  }
  return result;
}
