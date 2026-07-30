/**
 * Facebook Graph API publisher.
 *
 * Requires: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 * (a Page access token with the pages_manage_posts permission).
 *
 * Pacing:
 * - FACEBOOK_PAUSE_UNTIL — optional hard pause (unset = post now)
 * - FACEBOOK_MAX_POSTS_PER_DAY + FACEBOOK_MIN_GAP_MS (workflow: 144/day, 10 min)
 * - FACEBOOK_MAX_POSTS_PER_RUN (default 1) so one job cannot burst
 *
 * Website link (required on every post when configured):
 * - WEBSITE_BASE_URL=https://your-domain.com
 * - WEBSITE_ARTICLE_PATH=/article.html?id={id}  (optional template)
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
 * Build the Nexora website article URL for a saved news row.
 *
 * @param {string|number|undefined|null} newsId
 * @returns {string} absolute URL, or "" if WEBSITE_BASE_URL / id missing
 */
export function buildWebsiteArticleUrl(newsId) {
  const base = String(process.env.WEBSITE_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base || newsId === null || newsId === undefined || newsId === "") {
    return "";
  }

  const pathTemplate = String(
    process.env.WEBSITE_ARTICLE_PATH || "/article.html?id={id}"
  ).trim();

  const path = pathTemplate.includes("{id}")
    ? pathTemplate.replaceAll("{id}", encodeURIComponent(String(newsId)))
    : `${pathTemplate}${pathTemplate.includes("?") ? "&" : "?"}id=${encodeURIComponent(String(newsId))}`;

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Build the Facebook caption: post text + hashtags + website article link.
 * @param {string} facebookPost
 * @param {string|string[]|undefined|null} hashtags
 * @param {string} [websiteUrl]
 * @returns {string}
 */
export function buildFacebookMessage(facebookPost, hashtags, websiteUrl = "") {
  let message = String(facebookPost || "").trim();
  const tagLine = normalizeHashtags(hashtags);
  const siteLink = String(websiteUrl || "").trim();

  if (tagLine) {
    const messageLower = message.toLowerCase();
    const allPresent = tagLine
      .split(/\s+/)
      .every((tag) => messageLower.includes(tag.toLowerCase()));
    if (!allPresent) {
      message = message ? `${message}\n\n${tagLine}` : tagLine;
    }
  }

  if (siteLink) {
    // Avoid duplicating if the AI post already ends with the same URL.
    if (!message.includes(siteLink)) {
      message = message ? `${message}\n\n${siteLink}` : siteLink;
    }
  }

  return message;
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
 * @param {string} [payload.sourceUrl] - Original publisher URL (fallback link only).
 * @param {string|number} [payload.newsId] - Supabase news id for website URL.
 * @param {string} [payload.websiteUrl] - Prebuilt website article URL (optional).
 * @returns {Promise<{ published: true, id: string }|{ published: false, skipped: true, reason: string }>}
 * @throws {Error} If required env vars are missing, the request fails, or Facebook returns an error.
 */
export async function publishToFacebook({
  facebookPost,
  hashtags,
  imageUrl,
  sourceUrl,
  newsId,
  websiteUrl
}) {
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

  const siteArticleUrl = String(websiteUrl || "").trim() || buildWebsiteArticleUrl(newsId);
  const message = buildFacebookMessage(facebookPost, hashtags, siteArticleUrl);
  if (!message) {
    throw new Error("publishToFacebook: 'facebookPost' text is required");
  }

  await waitForFacebookInterval();

  const slot = consumeFacebookAttemptSlot();
  if (!slot.ok) {
    return { published: false, skipped: true, reason: slot.reason };
  }

  // Prefer the website article URL for Graph `link`; fall back to source.
  const linkUrl = siteArticleUrl || String(sourceUrl || "").trim();

  const usePhoto = Boolean(imageUrl);
  const endpoint = usePhoto
    ? `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/photos`
    : `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/feed`;

  const params = new URLSearchParams({ access_token: accessToken });
  if (usePhoto) {
    params.set("url", imageUrl);
    // Caption always includes the website link at the bottom when configured.
    params.set("caption", message);
  } else {
    params.set("message", message);
    if (linkUrl) {
      params.set("link", linkUrl);
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
