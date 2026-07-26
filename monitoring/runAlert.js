/**
 * Phase 8 — end-of-run health alert via Telegram Bot API.
 *
 * Reuses TELEGRAM_BOT_TOKEN. Chat target:
 *   TELEGRAM_ALERT_CHAT_ID (preferred, private ops chat) → else TELEGRAM_CHAT_ID
 *
 * Mode (TELEGRAM_ALERT_MODE):
 *   always   — send after every run (default)
 *   failures — only when failed > 0, or status is fatal
 *   off      — never send
 *
 * Fail-soft: alert errors never fail the bot run.
 */

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const MAX_ERROR_LINES = 5;
const MAX_MESSAGE_LENGTH = 3500;

/**
 * @param {object} summary
 * @param {number} summary.processed
 * @param {number} summary.skipped
 * @param {number} summary.failed
 * @param {number} summary.total
 * @param {number} summary.sources
 * @param {string[]} [summary.errors]
 * @param {"ok"|"fatal"} [summary.status]
 * @param {number} [summary.durationMs]
 * @returns {string}
 */
export function formatRunAlertMessage(summary) {
  const {
    processed = 0,
    skipped = 0,
    failed = 0,
    total = 0,
    sources = 0,
    errors = [],
    status = failed > 0 ? "degraded" : "ok",
    durationMs
  } = summary;

  const icon = status === "fatal" || failed > 0 ? "🔴" : processed > 0 ? "🟢" : "🟡";
  const lines = [
    `${icon} News Bot run ${status === "fatal" ? "FATAL" : failed > 0 ? "completed with errors" : "complete"}`,
    "",
    `Processed: ${processed}`,
    `Skipped: ${skipped}`,
    `Failed: ${failed}`,
    `Candidates: ${total}`,
    `Sources: ${sources}`
  ];

  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    lines.push(`Duration: ${Math.round(durationMs / 1000)}s`);
  }

  const errorLines = (errors || []).filter(Boolean).slice(0, MAX_ERROR_LINES);
  if (errorLines.length > 0) {
    lines.push("", "Errors:");
    for (const err of errorLines) {
      lines.push(`• ${String(err).slice(0, 200)}`);
    }
    if (errors.length > MAX_ERROR_LINES) {
      lines.push(`• …and ${errors.length - MAX_ERROR_LINES} more`);
    }
  }

  return lines.join("\n").slice(0, MAX_MESSAGE_LENGTH);
}

function resolveAlertMode() {
  const mode = (process.env.TELEGRAM_ALERT_MODE || "always").toLowerCase().trim();
  if (mode === "off" || mode === "failures" || mode === "always") {
    return mode;
  }
  return "always";
}

function shouldSendAlert(mode, summary) {
  if (mode === "off") return false;
  if (mode === "always") return true;
  // failures
  return summary.status === "fatal" || (summary.failed || 0) > 0;
}

/**
 * Sends a run summary to Telegram when configured.
 *
 * @param {object} summary - see formatRunAlertMessage
 * @param {(level: string, message: string, meta?: object) => void} [log]
 * @returns {Promise<{ sent: boolean, skipped?: boolean, reason?: string, id?: string }>}
 */
export async function sendRunAlert(summary, log = () => {}) {
  const mode = resolveAlertMode();
  if (!shouldSendAlert(mode, summary)) {
    log("info", "Run alert skipped by TELEGRAM_ALERT_MODE", { mode });
    return { sent: false, skipped: true, reason: `mode=${mode}` };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    log("info", "Run alert skipped — Telegram not configured", {
      hasToken: Boolean(botToken),
      hasChatId: Boolean(chatId)
    });
    return { sent: false, skipped: true, reason: "telegram_not_configured" };
  }

  const text = formatRunAlertMessage(summary);
  const endpoint = `${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      const detail = data?.description || response.statusText;
      log("warn", "Run alert failed to send", {
        status: response.status,
        detail
      });
      return { sent: false, reason: detail };
    }

    const id = data.result?.message_id ? String(data.result.message_id) : undefined;
    log("info", "Run alert sent", { id, chatId: String(chatId).slice(0, 6) + "…" });
    return { sent: true, id };
  } catch (error) {
    log("warn", "Run alert request failed", { message: error.message });
    return { sent: false, reason: error.message };
  }
}
