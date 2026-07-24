import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Phase 2 will replace this with a config-driven list of multiple sources.
const RSS_FEED_URL = "https://feeds.bbci.co.uk/news/rss.xml";
const SOURCE_NAME = "BBC";

// How many fresh (non-duplicate) items to process per run.
const MAX_ITEMS_PER_RUN = 5;

// Retry settings for the Groq API call.
const AI_MAX_RETRIES = 2;
const AI_RETRY_DELAY_MS = 2000;

function log(level, message, meta) {
  const line = `[${level.toUpperCase()}] ${message}`;
  if (meta !== undefined) {
    console.log(line, meta);
  } else {
    console.log(line);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts a labeled field from the AI's free-text response.
 * Captures everything up to the next known label (or end of string),
 * so multi-line fields like ARTICLE/FACEBOOK_POST aren't truncated to one line.
 */
function extractField(text, label, allLabels) {
  const otherLabels = allLabels.filter((l) => l !== label);
  const lookahead = otherLabels.length
    ? `(?:${otherLabels.join("|")}):|$`
    : "$";
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${lookahead})`, "i");
  return text.match(pattern)?.[1]?.trim() || "";
}

const AI_LABELS = [
  "CATEGORY",
  "URDU_TITLE",
  "URDU_SUMMARY",
  "ARTICLE",
  "HASHTAGS",
  "FACEBOOK_POST",
  "IMAGE_PROMPT"
];

function parseAiResponse(aiText) {
  return {
    category: extractField(aiText, "CATEGORY", AI_LABELS) || "General",
    urduTitle: extractField(aiText, "URDU_TITLE", AI_LABELS),
    urduSummary: extractField(aiText, "URDU_SUMMARY", AI_LABELS),
    article: extractField(aiText, "ARTICLE", AI_LABELS),
    hashtags: extractField(aiText, "HASHTAGS", AI_LABELS),
    facebookPost: extractField(aiText, "FACEBOOK_POST", AI_LABELS),
    imagePrompt: extractField(aiText, "IMAGE_PROMPT", AI_LABELS)
  };
}

/**
 * A parsed response is considered valid only if the fields we actually
 * publish downstream (Urdu title/summary + article) were extracted.
 * Missing category/hashtags/etc. are non-fatal and fall back to defaults.
 */
function isValidAiResult(result) {
  return Boolean(
    result.urduTitle && result.urduSummary && result.article
  );
}

async function callGroq(title) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: `Analyze this news headline and return EXACTLY in this format:

CATEGORY: Technology
URDU_TITLE: Urdu headline
URDU_SUMMARY: Two sentence Urdu summary
ARTICLE: 300 word detailed Urdu article
HASHTAGS: #News #Technology
FACEBOOK_POST: Complete Facebook post in Urdu
IMAGE_PROMPT: Professional AI image prompt

Headline:
${title}`
          }
        ],
        temperature: 0.7
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Groq API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq API response missing message content");
  }

  return content;
}

/**
 * Calls Groq with retries, then parses + validates the response.
 * Throws if no valid, well-formed result could be obtained.
 */
async function analyzeNews(title) {
  let lastError;

  for (let attempt = 1; attempt <= AI_MAX_RETRIES + 1; attempt++) {
    try {
      const aiText = await callGroq(title);
      const result = parseAiResponse(aiText);

      if (isValidAiResult(result)) {
        return result;
      }

      lastError = new Error("AI response did not match expected format");
      log("warn", `AI response validation failed (attempt ${attempt})`, { title });
    } catch (error) {
      lastError = error;
      log("warn", `Groq call failed (attempt ${attempt})`, { message: error.message });
    }

    if (attempt <= AI_MAX_RETRIES) {
      await sleep(AI_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

async function isDuplicate(url) {
  const { data, error } = await supabase
    .from("news")
    .select("url")
    .eq("url", url);

  if (error) {
    // Fail closed: if we can't verify, skip processing rather than risk a duplicate insert.
    throw new Error(`Duplicate check failed: ${error.message}`);
  }

  return Boolean(data && data.length > 0);
}

async function saveNews(item, aiResult) {
  const { error } = await supabase.from("news").insert({
    title: item.title,
    source: SOURCE_NAME,
    url: item.link,
    category: aiResult.category,
    urdu_title: aiResult.urduTitle,
    urdu_summary: aiResult.urduSummary,
    article: aiResult.article,
    hashtags: aiResult.hashtags,
    facebook_post: aiResult.facebookPost,
    image_prompt: aiResult.imagePrompt,
    image_url: `https://image.pollinations.ai/prompt/${encodeURIComponent(
      aiResult.imagePrompt
    )}`
  });

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }
}

/**
 * Processes a single item and returns its outcome ("processed" | "skipped"),
 * or throws if it failed. The caller is responsible for fail-soft handling.
 */
async function processItem(item) {
  if (!item.link || !item.title) {
    log("warn", "Skipping item with missing title/link");
    return "skipped";
  }

  const duplicate = await isDuplicate(item.link);
  if (duplicate) {
    log("info", "Skipping duplicate", { url: item.link });
    return "skipped";
  }

  const aiResult = await analyzeNews(item.title);
  await saveNews(item, aiResult);
  log("info", "News saved with full AI analysis", { title: item.title });
  return "processed";
}

async function run() {
  const feed = await parser.parseURL(RSS_FEED_URL);
  const items = feed.items.slice(0, MAX_ITEMS_PER_RUN);

  log("info", `Fetched ${feed.items.length} items, processing up to ${items.length}`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const outcome = await processItem(item);
      if (outcome === "processed") {
        processed++;
      } else {
        skipped++;
      }
    } catch (error) {
      failed++;
      log("error", "Failed to process item", {
        title: item.title,
        url: item.link,
        message: error.message
      });
      // Fail-soft: continue with the next item instead of aborting the whole run.
    }
  }

  log("info", "Run complete", { processed, skipped, failed, total: items.length });
}

run().catch((error) => {
  log("error", "Fatal error in run()", { message: error.message });
  process.exitCode = 1;
});
