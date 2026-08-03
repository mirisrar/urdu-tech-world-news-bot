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
  // Default production site when secret is unset (handoff: nexoranewsurdu.com).
  const base = String(
    process.env.WEBSITE_BASE_URL || "https://www.nexoranewsurdu.com"
  )
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
 * Clean a website URL for the caption (no leading # / whitespace).
 * @param {string} url
 * @returns {string}
 */
export function cleanWebsiteLink(url) {
  return String(url || "")
    .trim()
    .replace(/^#+/, "")
    .trim();
}

/**
 * Strip site URLs and trailing hashtag-only lines from AI caption so we can
 * rebuild the exact order: caption → URL → hashtags.
 * @param {string} text
 * @param {string} [siteLink]
 * @returns {string}
 */
export function stripCaptionExtras(text, siteLink = "") {
  let caption = String(text || "").trim();
  const link = cleanWebsiteLink(siteLink);

  if (link) {
    caption = caption.split(link).join(" ");
  }
  caption = caption
    .replace(/https?:\/\/(?:www\.)?nexoranewsurdu\.com\/[^\s#]*/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = caption.split(/\n/);
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    // Drop a trailing line that is only hashtags.
    if (/^(#[\w\u0600-\u06FF_]+(?:\s+#[\w\u0600-\u06FF_]+)*)+$/u.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }

  caption = lines.join("\n").trim();
  // Drop trailing inline hashtags on the last paragraph.
  caption = caption
    .replace(/(?:\s+#[\w\u0600-\u06FF_]+)+\s*$/u, "")
    .trim();
  return caption;
}

/**
 * Normalize image attribution for Facebook (one short line).
 * @param {string} [imageCredit]
 * @returns {string}
 */
export function formatFacebookImageCredit(imageCredit = "") {
  const raw = String(imageCredit || "").trim();
  if (!raw) return "";
  // Avoid duplicating a credit line if AI caption already mentioned it.
  return raw.slice(0, 120);
}

/**
 * Build Facebook caption in exact owner order:
 *   {caption}
 *   {website URL}
 *   {image credit}   ← Image: BBC / Photo: Name / Unsplash
 *   #tag1 #tag2 #tag3
 *
 * Hashtags must NEVER appear before the URL.
 *
 * @param {string} facebookPost
 * @param {string|string[]|undefined|null} hashtags
 * @param {string} [websiteUrl]
 * @param {string} [imageCredit]
 * @returns {string}
 */
export function buildFacebookMessage(
  facebookPost,
  hashtags,
  websiteUrl = "",
  imageCredit = ""
) {
  const siteLink = cleanWebsiteLink(websiteUrl);
  const caption = stripCaptionExtras(facebookPost, siteLink);
  const tagLine = normalizeHashtags(hashtags);
  const creditLine = formatFacebookImageCredit(imageCredit);

  const parts = [];
  if (caption) parts.push(caption);
  if (siteLink) parts.push(siteLink);
  if (creditLine) parts.push(creditLine);
  if (tagLine) parts.push(tagLine);
  return parts.join("\n\n");
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
 * @param {boolean} [payload.rawMessage] - If true, post facebookPost as-is (queue path).
 * @param {Date|string|number} [payload.scheduleAt] - If set, create a Facebook
 *   **native Scheduled** post (`published=false` + `scheduled_publish_time`).
 *   Must be at least ~10 minutes in the future (Meta rule).
 * @param {boolean} [payload.skipGapThrottle] - Skip min-gap / per-run slot (used when
 *   creating many native schedules in one bot run).
 * @param {boolean} [payload.immediate] - Editor / manual path: publish now, bypass
 *   drip throttle (pause still honored).
 * @returns {Promise<{ published: true, id: string, scheduled?: boolean, scheduledAt?: string }|{ published: false, skipped: true, reason: string }>}
 * @throws {Error} If required env vars are missing, the request fails, or Facebook returns an error.
 */
export async function publishToFacebook({
  facebookPost,
  hashtags,
  imageUrl,
  imageCredit,
  sourceUrl,
  newsId,
  websiteUrl,
  rawMessage = false,
  scheduleAt = null,
  skipGapThrottle = false,
  immediate = false
}) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must both be set");
  }

  // Soft-skip when paused / daily cap / min gap / per-run quota — caller
  // treats skipped as "try again later", not a hard fail.
  // Native schedule mode skips gap/slot (stagger is in scheduleAt).
  // immediate=true bypasses drip (editor Telegram path).
  const skipReason = getFacebookSkipReason();
  if (skipReason) {
    const isPause = String(skipReason).startsWith("paused_until");
    if (immediate) {
      if (isPause) {
        return { published: false, skipped: true, reason: skipReason };
      }
    } else {
      const isGapOrRun =
        String(skipReason).startsWith("min_gap") ||
        String(skipReason).startsWith("max_per_run");
      if (!(scheduleAt && skipGapThrottle && isGapOrRun)) {
        return { published: false, skipped: true, reason: skipReason };
      }
    }
  }

  const siteArticleUrl = String(websiteUrl || "").trim() || buildWebsiteArticleUrl(newsId);
  const message = rawMessage
    ? String(facebookPost || "").trim()
    : buildFacebookMessage(facebookPost, hashtags, siteArticleUrl, imageCredit);
  if (!message) {
    throw new Error("publishToFacebook: 'facebookPost' text is required");
  }

  /** @type {Date|null} */
  let scheduleDate = null;
  if (scheduleAt) {
    scheduleDate =
      scheduleAt instanceof Date ? scheduleAt : new Date(scheduleAt);
    if (!Number.isFinite(scheduleDate.getTime())) {
      throw new Error("publishToFacebook: invalid scheduleAt");
    }
    // Meta: scheduled_publish_time must be >= ~10 minutes from now.
    const minMs = Date.now() + 10 * 60 * 1000;
    if (scheduleDate.getTime() < minMs) {
      scheduleDate = new Date(minMs);
    }
  }

  if (!immediate && (!scheduleDate || !skipGapThrottle)) {
    await waitForFacebookInterval();
    const slot = consumeFacebookAttemptSlot();
    if (!slot.ok) {
      return { published: false, skipped: true, reason: slot.reason };
    }
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

  if (scheduleDate) {
    // Native Facebook Scheduled post — shows under Page → Scheduled.
    params.set("published", "false");
    params.set(
      "scheduled_publish_time",
      String(Math.floor(scheduleDate.getTime() / 1000))
    );
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
  return {
    published: true,
    id: postId,
    scheduled: Boolean(scheduleDate),
    scheduledAt: scheduleDate ? scheduleDate.toISOString() : undefined
  };
}
