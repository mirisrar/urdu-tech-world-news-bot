/**
 * Image pipeline (Phase 5): downloads the AI-generated image, optimizes
 * it, and uploads it to Supabase Storage so articles have a stable,
 * permanently-hosted image instead of relying on Pollinations.ai's
 * on-the-fly generation URL (which has no uptime/permanence guarantee).
 *
 * Falls back gracefully at every stage — a failure here should never
 * break the overall item processing, since the article itself is more
 * important than its image:
 *   1. Try: download from Pollinations.ai -> optimize with sharp ->
 *      upload to Supabase Storage -> return the permanent public URL.
 *   2. Fall back to the raw Pollinations.ai URL (same as pre-Phase-5
 *      behavior) if storage upload fails (e.g. the bucket doesn't exist
 *      yet — see DATABASE_SCHEMA.md for the required setup).
 *   3. Fall back to DEFAULT_FALLBACK_IMAGE_URL (if configured) if even
 *      generating/downloading the image fails outright.
 *   4. Fall back to no image at all (empty string) as a last resort.
 */

import sharp from "sharp";

const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt";

// Facebook/Open Graph's recommended link-preview size — also a
// reasonable general-purpose "article image" size for the website and
// most social platforms (they each re-crop as needed on their end).
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 630;
const OUTPUT_FORMAT = "webp";
const OUTPUT_QUALITY = 80;

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "news-images";

function buildPollinationsUrl(imagePrompt) {
  return `${POLLINATIONS_BASE_URL}/${encodeURIComponent(imagePrompt)}`;
}

function slugify(text, maxLength = 60) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "image";
}

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download returned HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function optimizeImage(inputBuffer) {
  return sharp(inputBuffer)
    .resize({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, fit: "cover" })
    .toFormat(OUTPUT_FORMAT, { quality: OUTPUT_QUALITY })
    .toBuffer();
}

async function uploadToStorage(supabase, buffer, slug) {
  const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${slug}.${OUTPUT_FORMAT}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: `image/${OUTPUT_FORMAT}`,
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Supabase Storage did not return a public URL after upload");
  }

  return data.publicUrl;
}

/**
 * Produces a permanent, optimized image URL for an article, or the best
 * available fallback if any stage fails.
 *
 * @param {object} supabase - An initialized Supabase client (needs Storage access).
 * @param {string} imagePrompt - The AI-generated image prompt.
 * @param {string} slugSource - Text to derive a filename slug from (e.g. the article title).
 * @param {(level: string, message: string, meta?: object) => void} log - Logger function (see index.js).
 * @returns {Promise<string>} A usable image URL — permanent if everything succeeded, best-effort otherwise. Empty string only if imagePrompt itself is empty.
 */
export async function getArticleImageUrl(supabase, imagePrompt, slugSource, log) {
  if (!imagePrompt) {
    return process.env.DEFAULT_FALLBACK_IMAGE_URL || "";
  }

  const pollinationsUrl = buildPollinationsUrl(imagePrompt);

  let rawImage;
  try {
    rawImage = await downloadImage(pollinationsUrl);
  } catch (error) {
    log("warn", "Failed to download generated image — using fallback", { message: error.message });
    return process.env.DEFAULT_FALLBACK_IMAGE_URL || pollinationsUrl;
  }

  let optimized;
  try {
    optimized = await optimizeImage(rawImage);
  } catch (error) {
    log("warn", "Failed to optimize image — using unoptimized Pollinations URL", {
      message: error.message
    });
    return pollinationsUrl;
  }

  try {
    return await uploadToStorage(supabase, optimized, slugify(slugSource));
  } catch (error) {
    log(
      "warn",
      "Failed to upload image to Supabase Storage — using on-the-fly Pollinations URL instead. " +
        `Create a public '${STORAGE_BUCKET}' bucket in Supabase to enable permanent image storage (see DATABASE_SCHEMA.md).`,
      { message: error.message }
    );
    return pollinationsUrl;
  }
}
