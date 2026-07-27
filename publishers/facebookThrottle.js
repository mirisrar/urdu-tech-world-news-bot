/**
 * Facebook post pacing — at most N posts per bot run, spaced for Page cadence.
 *
 * Default: 1 Facebook attempt per run. Pair with a 5-minute cron so the Page
 * gets ~1 post every 5 minutes instead of a burst of many at once.
 */

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
 * @returns {{ maxPerRun: number, intervalMs: number }}
 */
export function getFacebookThrottleConfig() {
  return {
    // 1 = one FB post attempt per Actions run (recommended with */5 cron).
    maxPerRun: envInt("FACEBOOK_MAX_POSTS_PER_RUN", 1),
    // Used only when maxPerRun > 1 within the same process.
    intervalMs: envInt("FACEBOOK_POST_INTERVAL_MS", 5 * 60 * 1000)
  };
}

/**
 * Whether another Facebook attempt is allowed this run (without consuming).
 */
export function canAttemptFacebook() {
  const { maxPerRun } = getFacebookThrottleConfig();
  return state.attemptsThisRun < maxPerRun;
}

/**
 * Reserve one Facebook attempt slot for this run.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function consumeFacebookAttemptSlot() {
  const { maxPerRun } = getFacebookThrottleConfig();
  if (state.attemptsThisRun >= maxPerRun) {
    return { ok: false, reason: "max_per_run" };
  }
  state.attemptsThisRun += 1;
  return { ok: true };
}

/**
 * Record a successful Facebook publish (for optional in-run spacing).
 */
export function noteFacebookSuccess() {
  state.successesThisRun += 1;
  state.lastSuccessAt = Date.now();
}

/**
 * If maxPerRun > 1, wait until FACEBOOK_POST_INTERVAL_MS since last success.
 */
export async function waitForFacebookInterval(sleepFn = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const { maxPerRun, intervalMs } = getFacebookThrottleConfig();
  if (maxPerRun <= 1 || intervalMs <= 0 || !state.lastSuccessAt) {
    return;
  }
  const elapsed = Date.now() - state.lastSuccessAt;
  const waitMs = intervalMs - elapsed;
  if (waitMs > 0) {
    await sleepFn(waitMs);
  }
}

/** Test helper — reset in-process counters. */
export function _resetFacebookThrottleForTests() {
  state.attemptsThisRun = 0;
  state.successesThisRun = 0;
  state.lastSuccessAt = 0;
}
