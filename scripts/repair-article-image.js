/**
 * One-off / workflow helper: re-resolve a topic-matching image for a news row
 * and update news.image_url (+ image_credit).
 *
 * Usage:
 *   NEWS_ID=2836 node scripts/repair-article-image.js
 *   NEWS_ID=2836 SOURCE_PAGE_URL=https://www.dawn.com/news/... node scripts/repair-article-image.js
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Prefers SOURCE_PAGE_URL / row.url og:image; else Unsplash/Pexels topic search.
 */

import { createClient } from "@supabase/supabase-js";
import { fetchOgImageFromPage } from "../fetcher.js";
import { storeOriginalArticleImage } from "../imagePipeline.js";
import { fetchTopicStockImage, hasStockImageProvider } from "../stockImage.js";

function log(level, message, meta) {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message;
  console[level === "error" ? "error" : "log"](`[${level}] ${line}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function main() {
  const newsId = Number(process.env.NEWS_ID || process.argv[2] || "");
  if (!Number.isFinite(newsId) || newsId <= 0) {
    throw new Error("Set NEWS_ID (or pass as argv[2])");
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error } = await supabase
    .from("news")
    .select("id, title, urdu_title, category, url, source, image_url, image_credit")
    .eq("id", newsId)
    .single();

  if (error || !row) {
    throw new Error(`Failed to load news ${newsId}: ${error?.message || "not found"}`);
  }

  log("info", "Loaded article", {
    id: row.id,
    title: row.title,
    category: row.category,
    oldImage: String(row.image_url || "").slice(0, 120)
  });

  const pageCandidates = [
    process.env.SOURCE_PAGE_URL,
    // Known Dawn URL for the CTD/Okara story (Google News wrapper has no og:image).
    newsId === 2836
      ? "https://www.dawn.com/news/2019578/ctd-arrests-two-raw-agents-with-ieds-in-okara"
      : "",
    row.url
  ].filter(Boolean);

  let imageUrl = "";
  let imageSource = "";
  let imageCredit = "";

  for (const pageUrl of pageCandidates) {
    const og = await fetchOgImageFromPage(pageUrl, log);
    if (og) {
      imageUrl = og;
      imageSource = "meta";
      imageCredit = row.source ? `Source: ${row.source}` : "Source: publisher";
      log("info", "Using publisher og:image", { pageUrl, imageUrl: og.slice(0, 120) });
      break;
    }
  }

  if (!imageUrl) {
    if (!hasStockImageProvider()) {
      throw new Error("No publisher og:image and no UNSPLASH/PEXELS keys configured");
    }
    const stock = await fetchTopicStockImage(
      {
        title: row.title,
        category: row.category,
        sourceName: row.source,
        link: row.url
      },
      log
    );
    if (!stock?.imageUrl) {
      throw new Error("Topic stock image fetch failed");
    }
    imageUrl = stock.imageUrl;
    imageSource = stock.provider;
    imageCredit = stock.imageCredit || `Source: ${stock.provider}`;
  }

  const stored = await storeOriginalArticleImage(supabase, imageUrl, row.title, log);

  const { data: updated, error: updateError } = await supabase
    .from("news")
    .update({
      image_url: stored,
      image_credit: imageCredit
    })
    .eq("id", newsId)
    .select("id, image_url, image_credit")
    .single();

  if (updateError) {
    throw new Error(`Update failed: ${updateError.message}`);
  }

  log("info", "Repaired article image", {
    id: updated.id,
    imageSource,
    image_url: updated.image_url,
    image_credit: updated.image_credit
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        id: updated.id,
        imageSource,
        image_url: updated.image_url,
        image_credit: updated.image_credit,
        article: `https://www.nexoranewsurdu.com/article.html?id=${updated.id}`
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exit(1);
});
