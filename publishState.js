/**
 * Durable publish markers for GitHub Actions runs.
 *
 * Why: if `fb_post_id` cannot be written to Supabase (missing
 * SUPABASE_SERVICE_ROLE_KEY under read-only RLS), publish-retry thinks
 * Facebook is still pending and re-posts the same articles → duplicates.
 *
 * This file-backed set is restored/saved via Actions cache so the next run
 * still knows which news IDs already went to Facebook.
 */

import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.BOT_PUBLISH_STATE_DIR || ".bot-publish-state";
const FACEBOOK_STATE_FILE = path.join(STATE_DIR, "facebook-posted.json");

/** @type {Map<string, { postId: string, at: string }>} */
let facebookPosted = new Map();
let loaded = false;

function newsKey(newsId) {
  return String(newsId);
}

export function loadPublishState(log = () => {}) {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(FACEBOOK_STATE_FILE)) {
      facebookPosted = new Map();
      return;
    }
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
    log("info", "Loaded Facebook publish state", { count: facebookPosted.size });
  } catch (error) {
    facebookPosted = new Map();
    log("warn", "Could not load Facebook publish state — starting empty", {
      message: error.message
    });
  }
}

export function persistPublishState(log = () => {}) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const obj = Object.fromEntries(facebookPosted.entries());
    fs.writeFileSync(FACEBOOK_STATE_FILE, JSON.stringify(obj, null, 2));
    log("info", "Saved Facebook publish state", { count: facebookPosted.size });
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

/** Test helper */
export function _resetPublishStateForTests() {
  facebookPosted = new Map();
  loaded = false;
}
