/**
 * Facebook Page Photo Stories (Graph API).
 *
 * Flow (Meta Page Stories API):
 *   1. POST /{page-id}/photos  published=false + url=<image>
 *   2. POST /{page-id}/photo_stories  photo_id=<id from step 1>
 *
 * Note: basic photo_stories does not attach a link sticker; the Feed post
 * already carries the website URL. Stories expire ~24h.
 *
 * Env: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 *      FACEBOOK_STORIES_ENABLED=true|false (default false — off)
 */

const FACEBOOK_API_VERSION = "v21.0";
const FACEBOOK_GRAPH_BASE_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`;

export function isFacebookStoriesEnabled() {
  // Stories disabled — Graph photo_stories was causing Facebook post errors (code 200).
  // Set FACEBOOK_STORIES_ENABLED=true only if you intentionally re-enable later.
  const raw = String(process.env.FACEBOOK_STORIES_ENABLED ?? "false").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

/**
 * Publish a photo story for a Page.
 *
 * @param {{ imageUrl: string }} opts
 * @returns {Promise<{ published: true, id: string, photoId: string }|{ published: false, skipped: true, reason: string }>}
 */
export async function publishFacebookPhotoStory({ imageUrl }) {
  if (!isFacebookStoriesEnabled()) {
    return { published: false, skipped: true, reason: "stories_disabled" };
  }

  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must both be set");
  }

  const url = String(imageUrl || "").trim();
  if (!url) {
    return { published: false, skipped: true, reason: "missing_image" };
  }

  // Step 1 — unpublished photo upload (Meta stores ~24h).
  const uploadParams = new URLSearchParams({
    access_token: accessToken,
    url,
    published: "false"
  });

  let uploadRes;
  try {
    uploadRes = await fetch(`${FACEBOOK_GRAPH_BASE_URL}/${pageId}/photos`, {
      method: "POST",
      body: uploadParams
    });
  } catch (networkError) {
    throw new Error(
      `Facebook story photo upload failed (network): ${networkError.message}`
    );
  }

  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || uploadData.error) {
    const errorMessage = uploadData?.error?.message || uploadRes.statusText;
    const errorCode = uploadData?.error?.code ? ` [${uploadData.error.code}]` : "";
    throw new Error(
      `Facebook story photo upload error${errorCode} (HTTP ${uploadRes.status}): ${errorMessage}`
    );
  }

  const photoId = uploadData.id;
  if (!photoId) {
    throw new Error("Facebook story photo upload missing photo id");
  }

  // Step 2 — publish photo story.
  const storyParams = new URLSearchParams({
    access_token: accessToken,
    photo_id: String(photoId)
  });

  let storyRes;
  try {
    storyRes = await fetch(`${FACEBOOK_GRAPH_BASE_URL}/${pageId}/photo_stories`, {
      method: "POST",
      body: storyParams
    });
  } catch (networkError) {
    throw new Error(
      `Facebook photo_stories failed (network): ${networkError.message}`
    );
  }

  const storyData = await storyRes.json().catch(() => ({}));
  if (!storyRes.ok || storyData.error || storyData.success === false) {
    const errorMessage = storyData?.error?.message || storyRes.statusText;
    const errorCode = storyData?.error?.code ? ` [${storyData.error.code}]` : "";
    throw new Error(
      `Facebook photo_stories error${errorCode} (HTTP ${storyRes.status}): ${errorMessage}`
    );
  }

  const storyId = storyData.post_id || storyData.id;
  if (!storyId) {
    throw new Error("Facebook photo_stories response missing post_id");
  }

  return { published: true, id: String(storyId), photoId: String(photoId) };
}
