/**
 * Facebook Graph API publisher.
 *
 * Requires: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 * (a Page access token with the pages_manage_posts permission).
 *
 * Pacing:
 * - FACEBOOK_PAUSE_UNTIL — hard pause (spam cool-down)
 * - FACEBOOK_MAX_POSTS_PER_DAY (default 6) + FACEBOOK_MIN_GAP_MS (default 4h)
 * - FACEBOOK_MAX_POSTS_PER_RUN (default 1) so one job cannot burst
 */

import {
  consumeFacebookAttemptSlot,
  getFacebookSkipReason,
  noteFacebookSuccess,
  waitForFacebookInterval
} from "./facebookThrottle.js";

const FACEBOOK_API_VERSION = "v21.0";
const FACEBOOK_GRAPH_BASE_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`;

/**
 * Normalize hashtag list/string into a single space-separated "#tag" line.
 * @param {string|string[]|undefined|null} hashtags
 * @returns {string}
 */
function normalizeHashtags(hashtags) {
  const raw = Array.isArray(hashtags)
    ? hashtags.join(" ")
    : typeof hashtags === "string"
      ? hashtags
      : "";

  const tags = raw
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));

  // Dedupe case-insensitively while preserving first spelling.
  const seen = new Set();
  const unique = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tag);
  }
  return unique.join(" ");
}

/**
 * Append hashtags to the Facebook message when missing from the post body.
 * @param {string} facebookPost
 * @param {string|string[]|undefined|null} hashtags
 * @returns {string}
 */
function buildFacebookMessage(facebookPost, hashtags) {
  const message = String(facebookPost || "").trim();
  const tagLine = normalizeHashtags(hashtags);
  if (!tagLine) return message;

  // Skip append if the post already ends with / contains the same tag set.
  const messageLower = message.toLowerCase();
  const allPresent = tagLine
    .split(/\s+/)
    .every((tag) => messageLower.includes(tag.toLowerCase()));
  if (allPresent) return message;

  return `${message}\n\n${tagLine}`;
}

/**
 * Publishes a news item to a Facebook Page's feed via the Graph API.
 *
 * If an image URL is available, posts to `/{page-id}/photos` (the Graph
 * API accepts a remote image URL directly via the `url` param — no local
 * download/upload needed). Otherwise falls back to a text+link post on
 * `/{page-id}/feed`.
 *
 * @param {object} payload
 * @param {string} payload.facebookPost - Ready-to-publish Urdu post text.
 * @param {string|string[]} [payload.hashtags] - Hashtags appended to the post.
 * @param {string} [payload.imageUrl] - Remote image URL to attach.
 * @param {string} [payload.sourceUrl] - Original article URL (used as `link` for text-only posts).
 * @returns {Promise<{ published: true, id: string }>}
 * @throws {Error} If required env vars are missing, the request fails, or Facebook returns an error.
 */
export async function publishToFacebook({ facebookPost, hashtags, imageUrl, sourceUrl }) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must both be set");
  }

  // Soft-skip when paused / daily cap / min gap / per-run quota — caller
  // treats skipped as "try again later", not a hard fail.
  const skipReason = getFacebookSkipReason();
  if (skipReason) {
    return { published: false, skipped: true, reason: skipReason };
  }

  const message = buildFacebookMessage(facebookPost, hashtags);
  if (!message) {
    throw new Error("publishToFacebook: 'facebookPost' text is required");
  }

  await waitForFacebookInterval();

  const slot = consumeFacebookAttemptSlot();
  if (!slot.ok) {
    return { published: false, skipped: true, reason: slot.reason };
  }

  const usePhoto = Boolean(imageUrl);
  const endpoint = usePhoto
    ? `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/photos`
    : `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/feed`;

  const params = new URLSearchParams({ access_token: accessToken });
  if (usePhoto) {
    params.set("url", imageUrl);
    params.set("caption", message);
  } else {
    params.set("message", message);
    if (sourceUrl) {
      params.set("link", sourceUrl);
    }
  }

  let response;
  try {
    response = await fetch(endpoint, { method: "POST", body: params });
  } catch (networkError) {
    throw new Error(`Facebook request failed (network error): ${networkError.message}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    const errorMessage = data?.error?.message || response.statusText;
    const errorCode = data?.error?.code ? ` [${data.error.code}]` : "";
    throw new Error(`Facebook API error${errorCode} (HTTP ${response.status}): ${errorMessage}`);
  }

  const postId = data.post_id || data.id;
  if (!postId) {
    throw new Error("Facebook API response missing a post id");
  }

  noteFacebookSuccess();
  return { published: true, id: postId };
}
