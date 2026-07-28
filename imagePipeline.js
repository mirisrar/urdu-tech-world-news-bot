/**
 * Image pipeline — ORIGINAL article images only (no AI / Pollinations).
 *
 * Flow:
 *   1. Caller (index.js) resolves the source image via fetcher.resolveArticleImage()
 *      (RSS media / enclosure / og:image / twitter:image / unique stock fallback).
 *   2. Optionally download that real image, optimize with sharp, upload to
 *      Supabase Storage for a stable public URL.
 *   3. On any failure, keep the original remote URL (or unique fallback).
 */

import sharp from "sharp";
import {
  DEFAULT_NEWS_PLACEHOLDER_IMAGE,
  isLegacySharedFallback,
  normalizeImageUrl
} from "./fetcher.js";

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 630;
const OUTPUT_FORMAT = "webp";
const OUTPUT_QUALITY = 80;

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "news-images";

function slugify(text, maxLength = 60) {
  return (
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength) || "image"
  );
}

async function downloadImage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NexoraNewsBot/1.0; +https://github.com/mirisrar/urdu-tech-world-news-bot)",
      Accept: "image/*,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`Image download returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
    throw new Error(`URL did not return an image (content-type: ${contentType})`);
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

  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, {
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
 * Persist an already-resolved *original* article image URL (or unique stock
 * fallback). Never generates AI images. Never calls Pollinations.
 *
 * @param {object} supabase
 * @param {string} originalImageUrl - From fetcher.resolveArticleImage()
 * @param {string} slugSource
 * @param {(level: string, message: string, meta?: object) => void} log
 * @returns {Promise<string>}
 */
export async function storeOriginalArticleImage(supabase, originalImageUrl, slugSource, log) {
  const sourceUrl = normalizeImageUrl(originalImageUrl);
  if (!sourceUrl) {
    return DEFAULT_NEWS_PLACEHOLDER_IMAGE;
  }

  // Skip re-hosting only the *legacy shared* placeholder (identical on every
  // row). Unique per-article stock fallbacks should still be uploaded when
  // Storage is available so the site keeps stable URLs.
  if (isLegacySharedFallback(sourceUrl)) {
    return sourceUrl;
  }

  let rawImage;
  try {
    rawImage = await downloadImage(sourceUrl);
  } catch (error) {
    log("warn", "Failed to download article image — using source URL as-is", {
      message: error.message
    });
    return sourceUrl;
  }

  let optimized;
  try {
    optimized = await optimizeImage(rawImage);
  } catch (error) {
    log("warn", "Failed to optimize image — using source URL as-is", {
      message: error.message
    });
    return sourceUrl;
  }

  try {
    return await uploadToStorage(supabase, optimized, slugify(slugSource));
  } catch (error) {
    log(
      "warn",
      "Failed to upload image to Supabase Storage — using remote URL. " +
        `Create a public '${STORAGE_BUCKET}' bucket to enable permanent storage.`,
      { message: error.message }
    );
    return sourceUrl;
  }
}

/**
 * @deprecated Use storeOriginalArticleImage + fetcher.resolveArticleImage.
 * Kept as a thin alias so older imports don't break mid-refactor.
 */
export async function getArticleImageUrl(supabase, originalImageUrl, slugSource, log) {
  return storeOriginalArticleImage(supabase, originalImageUrl, slugSource, log);
}
