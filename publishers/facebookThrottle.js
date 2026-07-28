/**
 * Facebook post pacing — drip posts inside a single Actions run.
 *
 * GitHub five-minute cron is unreliable (often delayed/skipped), so we cannot
 * depend on a new workflow every 5 minutes. Instead one run may publish
 * several Facebook posts, waiting FACEBOOK_POST_INTERVAL_MS between them.
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

/** Read FACEBOOK_MAX_POSTS_PER_RUN and FACEBOOK_POST_INTERVAL_MS. */
export function getFacebookThrottleConfig() {
  return {
    // How many FB posts this Actions job may attempt (drip with interval).
    maxPerRun: envInt("FACEBOOK_MAX_POSTS_PER_RUN", 12),
    // Wait between successful posts inside the same run (~5 minutes).
    intervalMs: envInt("FACEBOOK_POST_INTERVAL_MS", 5 * 60 * 1000)
  };
}

/** Whether another Facebook attempt is allowed this run (without consuming). */
export function canAttemptFacebook() {
  const { maxPerRun } = getFacebookThrottleConfig();
  return state.attemptsThisRun < maxPerRun;
}

/**
 * Reserve one Facebook attempt slot for this run.
 * Returns { ok: true } or { ok: false, reason: "max_per_run" }.
 */
export function consumeFacebookAttemptSlot() {
  const { maxPerRun } = getFacebookThrottleConfig();
  if (state.attemptsThisRun >= maxPerRun) {
    return { ok: false, reason: "max_per_run" };
  }
  state.attemptsThisRun += 1;
  return { ok: true };
}

/** Record a successful Facebook publish (starts the inter-post timer). */
export function noteFacebookSuccess() {
  state.successesThisRun += 1;
  state.lastSuccessAt = Date.now();
}

/**
 * Wait until FACEBOOK_POST_INTERVAL_MS since the last successful FB post.
 * Used so one long Actions run can drip 1 post every 5 minutes.
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
    "[INFO] Waiting " + waitSec + "s before next Facebook post (drip interval)",
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
  return { ...state };
}

/** Test helper — reset in-process counters. */
export function _resetFacebookThrottleForTests() {
  state.attemptsThisRun = 0;
  state.successesThisRun = 0;
  state.lastSuccessAt = 0;
}
