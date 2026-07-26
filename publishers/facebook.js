/**
 * Facebook Graph API publisher.
 *
 * Requires: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 * (a Page access token with the pages_manage_posts permission).
 */

const FACEBOOK_API_VERSION = "v21.0";
const FACEBOOK_GRAPH_BASE_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`;

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
 * @param {string} [payload.imageUrl] - Remote image URL to attach.
 * @param {string} [payload.sourceUrl] - Original article URL (used as `link` for text-only posts).
 * @returns {Promise<{ published: true, id: string }>}
 * @throws {Error} If required env vars are missing, the request fails, or Facebook returns an error.
 */
export async function publishToFacebook({ facebookPost, imageUrl, sourceUrl }) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must both be set");
  }

  const message = facebookPost?.trim();
  if (!message) {
    throw new Error("publishToFacebook: 'facebookPost' text is required");
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

  return { published: true, id: postId };
}
