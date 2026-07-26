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
