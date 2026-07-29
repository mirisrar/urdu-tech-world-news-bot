/**
 * Facebook post pacing — pause window, daily cap, and gaps between posts.
 *
 * After Meta spam flags, we:
 *   1. Pause all Facebook posts until FACEBOOK_PAUSE_UNTIL
 *   2. Then allow at most FACEBOOK_MAX_POSTS_PER_DAY (default 6)
 *   3. Enforce FACEBOOK_MIN_GAP_MS between successes (default 4 hours)
 *   4. Cap FACEBOOK_MAX_POSTS_PER_RUN (default 1) so one job cannot burst
 *
 * Daily count / last success persist in .bot-publish-state (Actions cache).
 */

import {
  getFacebookCadence,
  noteFacebookDailySuccess
} from "../publishState.js";

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const state = {
  attemptsThisRun: 0,
  successesThisRun: 0,
  lastSuccessAt: 0
};

/**
 * @returns {{
 *   maxPerRun: number,
 *   intervalMs: number,
 *   maxPerDay: number,
 *   minGapMs: number,
 *   pauseUntilMs: number|null,
 *   pauseUntilIso: string
 * }}
 */
export function getFacebookThrottleConfig() {
  const pauseRaw = String(process.env.FACEBOOK_PAUSE_UNTIL || "").trim();
  let pauseUntilMs = null;
  if (pauseRaw) {
    const parsed = Date.parse(pauseRaw);
    if (Number.isFinite(parsed)) pauseUntilMs = parsed;
  }

  return {
    // How many FB posts this Actions job may attempt.
    maxPerRun: envInt("FACEBOOK_MAX_POSTS_PER_RUN", 1),
    // Optional in-run wait between successes in the *same* job (usually unused
    // when maxPerRun=1). Kept for backwards compatibility.
    intervalMs: envInt("FACEBOOK_POST_INTERVAL_MS", 0),
    // Hard daily cap (UTC day) after the pause ends.
    maxPerDay: envInt("FACEBOOK_MAX_POSTS_PER_DAY", 6),
    // Minimum gap between successful posts across runs (default 4 hours).
    minGapMs: envInt("FACEBOOK_MIN_GAP_MS", 4 * 60 * 60 * 1000),
    pauseUntilMs,
    pauseUntilIso: pauseRaw
  };
}

/**
 * Why Facebook posting is blocked right now, or null if allowed (ignoring
 * the in-run attempt counter — caller still checks maxPerRun separately).
 * @returns {string|null}
 */
export function getFacebookBlockReason(now = Date.now()) {
  const { pauseUntilMs, pauseUntilIso, maxPerDay, minGapMs } = getFacebookThrottleConfig();

  if (pauseUntilMs !== null && now < pauseUntilMs) {
    const hoursLeft = Math.ceil((pauseUntilMs - now) / (60 * 60 * 1000));
    return `paused_until_${pauseUntilIso || new Date(pauseUntilMs).toISOString()}_(~${hoursLeft}h)`;
  }

  const cadence = getFacebookCadence(now);
  if (cadence.count >= maxPerDay) {
    return `daily_cap_${maxPerDay}`;
  }

  if (minGapMs > 0 && cadence.lastSuccessAt) {
    const last = Date.parse(cadence.lastSuccessAt);
    if (Number.isFinite(last)) {
      const elapsed = now - last;
      if (elapsed < minGapMs) {
        const waitMin = Math.ceil((minGapMs - elapsed) / 60000);
        return `min_gap_(~${waitMin}m)`;
      }
    }
  }

  return null;
}

/** Whether another Facebook attempt is allowed this run. */
export function canAttemptFacebook(now = Date.now()) {
  if (getFacebookBlockReason(now)) return false;
  const { maxPerRun } = getFacebookThrottleConfig();
  return state.attemptsThisRun < maxPerRun;
}

/**
 * Soft-skip reason for publishers (pause / daily / gap / max_per_run).
 * @returns {string|null} null means OK to attempt
 */
export function getFacebookSkipReason(now = Date.now()) {
  const blocked = getFacebookBlockReason(now);
  if (blocked) return blocked;
  const { maxPerRun } = getFacebookThrottleConfig();
  if (state.attemptsThisRun >= maxPerRun) return "max_per_run";
  return null;
}

/**
 * Reserve one Facebook attempt slot for this run.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export function consumeFacebookAttemptSlot(now = Date.now()) {
  const reason = getFacebookSkipReason(now);
  if (reason) {
    return { ok: false, reason };
  }
  state.attemptsThisRun += 1;
  return { ok: true };
}

/** Record a successful Facebook publish (in-run + daily cadence). */
export function noteFacebookSuccess(at = new Date()) {
  state.successesThisRun += 1;
  state.lastSuccessAt = at.getTime();
  noteFacebookDailySuccess(at);
}

/**
 * Wait until FACEBOOK_POST_INTERVAL_MS since the last success *in this run*.
 * Cross-run gaps are enforced via getFacebookBlockReason (no long sleeps).
 */
export async function waitForFacebookInterval(sleepFn) {
  const sleep = sleepFn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const { intervalMs } = getFacebookThrottleConfig();
  if (intervalMs <= 0 || !state.lastSuccessAt) {
    return 0;
  }
  const elapsed = Date.now() - state.lastSuccessAt;
  const waitMs = intervalMs - elapsed;
  if (waitMs <= 0) {
    return 0;
  }

  const waitSec = Math.ceil(waitMs / 1000);
  console.log(
    "[INFO] Waiting " + waitSec + "s before next Facebook post (in-run interval)",
    JSON.stringify({
      waitMs,
      successesThisRun: state.successesThisRun,
      intervalMs
    })
  );
  await sleep(waitMs);
  return waitMs;
}

/** Snapshot of in-process counters. */
export function getFacebookThrottleState() {
  return { ...state, cadence: getFacebookCadence() };
}

/** Test helper — reset in-process counters. */
export function _resetFacebookThrottleForTests() {
  state.attemptsThisRun = 0;
  state.successesThisRun = 0;
  state.lastSuccessAt = 0;
}
