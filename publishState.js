/**
 * Durable publish markers for GitHub Actions runs.
 *
 * - facebook-posted.json: newsId → already posted (dedupe)
 * - facebook-cadence.json: daily count + last success (6/day pacing)
 */

import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.BOT_PUBLISH_STATE_DIR || ".bot-publish-state";
const FACEBOOK_STATE_FILE = path.join(STATE_DIR, "facebook-posted.json");
const FACEBOOK_CADENCE_FILE = path.join(STATE_DIR, "facebook-cadence.json");

/** @type {Map<string, { postId: string, at: string }>} */
let facebookPosted = new Map();

/** @type {{ day: string, count: number, lastSuccessAt: string }} */
let facebookCadence = { day: "", count: 0, lastSuccessAt: "" };

let loaded = false;

function newsKey(newsId) {
  return String(newsId);
}

/** UTC calendar day key YYYY-MM-DD */
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function defaultCadence(day = utcDayKey()) {
  return { day, count: 0, lastSuccessAt: "" };
}

export function loadPublishState(log = () => {}) {
  if (loaded) return;
  loaded = true;

  try {
    if (!fs.existsSync(FACEBOOK_STATE_FILE)) {
      facebookPosted = new Map();
    } else {
      const raw = JSON.parse(fs.readFileSync(FACEBOOK_STATE_FILE, "utf8"));
      const entries = raw && typeof raw === "object" ? Object.entries(raw) : [];
      facebookPosted = new Map(
        entries
          .filter(([id, value]) => id && value && (value.postId || value === true))
          .map(([id, value]) => [
            String(id),
            typeof value === "object"
              ? { postId: String(value.postId || ""), at: value.at || "" }
              : { postId: "", at: "" }
          ])
      );
    }
    log("info", "Loaded Facebook publish state", { count: facebookPosted.size });
  } catch (error) {
    facebookPosted = new Map();
    log("warn", "Could not load Facebook publish state — starting empty", {
      message: error.message
    });
  }

  try {
    if (!fs.existsSync(FACEBOOK_CADENCE_FILE)) {
      facebookCadence = defaultCadence();
    } else {
      const raw = JSON.parse(fs.readFileSync(FACEBOOK_CADENCE_FILE, "utf8"));
      facebookCadence = {
        day: String(raw?.day || ""),
        count: Number(raw?.count) || 0,
        lastSuccessAt: String(raw?.lastSuccessAt || "")
      };
    }
    // Roll to today if the file is from a previous UTC day.
    const today = utcDayKey();
    if (facebookCadence.day !== today) {
      facebookCadence = {
        day: today,
        count: 0,
        lastSuccessAt: facebookCadence.lastSuccessAt || ""
      };
    }
    log("info", "Loaded Facebook cadence state", { ...facebookCadence });
  } catch (error) {
    facebookCadence = defaultCadence();
    log("warn", "Could not load Facebook cadence state — starting empty", {
      message: error.message
    });
  }
}

export function persistPublishState(log = () => {}) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const obj = Object.fromEntries(facebookPosted.entries());
    fs.writeFileSync(FACEBOOK_STATE_FILE, JSON.stringify(obj, null, 2));
    fs.writeFileSync(FACEBOOK_CADENCE_FILE, JSON.stringify(facebookCadence, null, 2));
    log("info", "Saved Facebook publish state", {
      postedCount: facebookPosted.size,
      cadence: facebookCadence
    });
  } catch (error) {
    log("warn", "Could not save Facebook publish state", { message: error.message });
  }
}

export function wasFacebookPosted(newsId) {
  if (newsId === null || newsId === undefined || newsId === "") return false;
  return facebookPosted.has(newsKey(newsId));
}

export function getFacebookPostedId(newsId) {
  return facebookPosted.get(newsKey(newsId))?.postId || "";
}

export function markFacebookPosted(newsId, postId = "") {
  if (newsId === null || newsId === undefined || newsId === "") return;
  facebookPosted.set(newsKey(newsId), {
    postId: String(postId || ""),
    at: new Date().toISOString()
  });
}

/**
 * Snapshot of today's Facebook posting cadence (UTC day).
 * @returns {{ day: string, count: number, lastSuccessAt: string }}
 */
export function getFacebookCadence() {
  const today = utcDayKey();
  if (facebookCadence.day !== today) {
    facebookCadence = {
      day: today,
      count: 0,
      lastSuccessAt: facebookCadence.lastSuccessAt || ""
    };
  }
  return { ...facebookCadence };
}

/**
 * Record a successful Facebook post against the daily cadence counter.
 */
export function noteFacebookDailySuccess(at = new Date()) {
  const today = utcDayKey(at);
  if (facebookCadence.day !== today) {
    facebookCadence = { day: today, count: 0, lastSuccessAt: "" };
  }
  facebookCadence.count += 1;
  facebookCadence.lastSuccessAt = at.toISOString();
  return { ...facebookCadence };
}

/** Test helper */
export function _resetPublishStateForTests() {
  facebookPosted = new Map();
  facebookCadence = defaultCadence();
  loaded = false;
}
