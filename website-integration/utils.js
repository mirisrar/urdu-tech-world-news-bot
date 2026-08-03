/**
 * Small presentation helpers shared across the example pages. Not
 * Supabase-specific — feel free to replace these with your own
 * equivalents if Nexora News Urdu already has its own formatting utils.
 */

const FALLBACK_IMAGE = "/assets/images/placeholder-news.jpg";

/**
 * Formats an ISO timestamp as a relative Urdu-friendly string
 * (falls back to a plain date for anything older than a week).
 * @param {string} isoTimestamp
 */
export function formatRelativeTime(isoTimestamp) {
  if (!isoTimestamp) return "";

  const then = new Date(isoTimestamp).getTime();
  const diffMs = Date.now() - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "ابھی";
  if (diffMinutes < 60) return `${diffMinutes} منٹ پہلے`;
  if (diffHours < 24) return `${diffHours} گھنٹے پہلے`;
  if (diffDays < 7) return `${diffDays} دن پہلے`;

  return new Date(isoTimestamp).toLocaleDateString("ur-PK", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/**
 * Returns a usable image URL, falling back to a local placeholder if the
 * article has none (image pipeline failures on the bot side can still
 * result in an empty image_url in rare cases — see the bot's
 * imagePipeline.js fallback chain).
 * @param {string} [imageUrl]
 */
export function resolveImageUrl(imageUrl) {
  return imageUrl && imageUrl.trim() ? imageUrl : FALLBACK_IMAGE;
}

/**
 * Truncates the Urdu summary/article to a safe excerpt length for card
 * previews, without cutting mid-word where reasonably possible.
 * @param {string} text
 * @param {number} [maxLength=150]
 */
export function excerpt(text, maxLength = 150) {
  if (!text || text.length <= maxLength) return text || "";
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`;
}

/**
 * Builds the Article Page URL for a given article row.
 * @param {{id: string|number}} article
 */
export function articleUrl(article) {
  return `/article.html?id=${encodeURIComponent(article.id)}`;
}

/**
 * Sets / updates a <meta> (or <link>) tag by `id`, or creates it in <head>.
 * @param {string} id
 * @param {string} attr
 * @param {string} value
 * @param {string} [tagName="meta"]
 */
function setHeadTag(id, attr, value, tagName = "meta") {
  if (value == null || value === "") return;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tagName);
    el.id = id;
    if (tagName === "meta" && id.startsWith("og-")) {
      el.setAttribute("property", id.replace(/^og-/, "og:").replace("og:headline", "og:title"));
    } else if (tagName === "meta" && id.startsWith("twitter-")) {
      el.setAttribute("name", id.replace(/^twitter-/, "twitter:"));
    } else if (tagName === "meta" && id === "meta-description") {
      el.setAttribute("name", "description");
    } else if (tagName === "meta" && id === "meta-keywords") {
      el.setAttribute("name", "keywords");
    } else if (tagName === "link") {
      el.setAttribute("rel", "canonical");
    }
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Applies DB SEO fields to document title + meta / Open Graph / Twitter tags.
 * Expects article rows that include seo_title, seo_description, seo_keywords
 * (see newsApi PUBLIC_COLUMNS). Safe to call after getArticleById().
 *
 * Live Nexora site: mirror this in js/article.js updateSeo(), and ensure
 * js/api.js NEWS_DETAIL_COLUMNS selects seo_title, seo_description, seo_keywords.
 *
 * @param {object} article
 * @param {object} [options]
 * @param {string} [options.brand="Nexora News Urdu"]
 * @param {string} [options.fallbackImage]
 */
export function applyArticleSeoMeta(article, options = {}) {
  if (!article || typeof document === "undefined") return;

  const brand = options.brand || "Nexora News Urdu";
  const seoTitle = (
    article.seo_title ||
    article.urdu_title ||
    article.title ||
    brand
  ).trim();
  const seoDescription = (
    article.seo_description ||
    article.urdu_summary ||
    ""
  )
    .trim()
    .slice(0, 160);
  const seoKeywords = String(article.seo_keywords || "").trim();
  const rawImage = article.image_url || options.fallbackImage || "";
  let seoImage = rawImage;
  try {
    if (rawImage && !/^https?:\/\//i.test(rawImage)) {
      seoImage = new URL(rawImage, window.location.origin).href;
    }
  } catch (_) {
    /* keep raw */
  }
  const seoUrl = typeof window !== "undefined" ? window.location.href : "";

  document.title = `${seoTitle} — ${brand}`;
  setHeadTag("meta-description", "content", seoDescription);
  setHeadTag("meta-keywords", "content", seoKeywords);
  setHeadTag("canonical-link", "href", seoUrl, "link");
  setHeadTag("og-headline", "content", seoTitle);
  setHeadTag("og-description", "content", seoDescription);
  setHeadTag("og-image", "content", seoImage);
  setHeadTag("og-url", "content", seoUrl);
  setHeadTag("twitter-title", "content", seoTitle);
  setHeadTag("twitter-description", "content", seoDescription);
  setHeadTag("twitter-image", "content", seoImage);
}
