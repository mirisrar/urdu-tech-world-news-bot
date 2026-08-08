/**
 * AI agent — Urdu news package generation only.
 *
 * Image generation / image_prompt is intentionally DISABLED.
 * Article images come from the original news site via fetcher.js
 * (RSS media tags + og:image / twitter:image).
 */

/** Primary first — every analyzeNews call starts here so quota reset auto-recovers. */
const DEFAULT_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-3-flash"
];

/**
 * Ordered Gemini models. Override with GEMINI_MODELS=model1,model2,...
 * @returns {string[]}
 */
export function getGeminiModels() {
  const raw = String(process.env.GEMINI_MODELS || "").trim();
  if (!raw) return [...DEFAULT_GEMINI_MODELS];
  const list = raw
    .split(/[,|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [...DEFAULT_GEMINI_MODELS];
}

function geminiGenerateUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/** @param {unknown} err */
function isGeminiQuotaOrRateLimitError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("too many requests")
  );
}

// Prompt version history:
//   v2 — structured JSON, headline-only input
//   v3 — full source text + strict Urdu + AI image_prompt
//   v4 — AI image_prompt removed; images from original article only
//   v5 — seo_description + seo_keywords for website SEO columns
export const PROMPT_VERSION = 5;

const AI_MAX_RETRIES = 2;
const AI_RETRY_DELAY_MS = 2000;

/** Minimum Urdu article body length (characters) — ~3–4 paragraphs. */
const MIN_BODY_URDU_CHARS = 450;

/** Arabic / Urdu script detection (enough letters to reject English-only). */
const URDU_SCRIPT_RE = /[\u0600-\u06FF]/g;

const SYSTEM_INSTRUCTION = `You are a senior Urdu news editor for an Urdu news website (Nexora News Urdu).

HARD RULES — violate none of these:
1. Write title_urdu, body_urdu, urdu_summary, seo_title, seo_description, and facebook_post ONLY in clean Urdu using Arabic script (اردو). Do NOT write those fields in English, Roman Urdu, or Hindi Devanagari. seo_keywords may mix Urdu/English topic terms.
2. body_urdu MUST be a FULL news article: at least 3 to 4 detailed paragraphs (roughly 300–450 Urdu words). Never return only a headline, one sentence, or a short teaser as body_urdu.
3. Expand from the provided English source title + source text. Stay factual; do not invent quotes or statistics not supported by the source. If source text is thin, write a careful multi-paragraph Urdu news brief from the headline facts only.
4. Do NOT generate image prompts, image URLs, or any visual-generation fields. Images are handled separately from the original news website.
5. Follow the JSON schema exactly.`;

/**
 * Gemini responseSchema — text fields only (no image_prompt).
 */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: {
      type: "STRING",
      description:
        "One English category from this list only: Technology, AI, World, Sports, Business, Politics, Entertainment, Health, Education, Pakistan"
    },
    title_urdu: {
      type: "STRING",
      description: "Full news headline in clean Urdu (Arabic script only)"
    },
    urdu_summary: {
      type: "STRING",
      description: "Exactly two sentences of Urdu summary (Arabic script)"
    },
    seo_title: {
      type: "STRING",
      description: "SEO-friendly Urdu title, distinct from title_urdu, Arabic script"
    },
    seo_description: {
      type: "STRING",
      description:
        "Urdu meta description for search/social, ~140–160 characters, Arabic script, no hashtags"
    },
    seo_keywords: {
      type: "STRING",
      description:
        "Comma-separated SEO keywords (5–12), mix of Urdu and English topic terms, no # symbols"
    },
    body_urdu: {
      type: "STRING",
      description:
        "Full Urdu article body in Arabic script: minimum 3–4 detailed paragraphs (~300–450 words). Not a headline."
    },
    hashtags: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "3-5 hashtags starting with # (can mix Urdu/English tags)"
    },
    facebook_post: {
      type: "STRING",
      description: "Ready-to-publish Facebook post entirely in Urdu (Arabic script)"
    }
  },
  required: [
    "category",
    "title_urdu",
    "urdu_summary",
    "seo_title",
    "seo_description",
    "seo_keywords",
    "body_urdu",
    "hashtags",
    "facebook_post"
  ]
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countUrduChars(text) {
  return (String(text || "").match(URDU_SCRIPT_RE) || []).length;
}

function looksLikeUrdu(text, minChars = 20) {
  return countUrduChars(text) >= minChars;
}

function paragraphCount(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

/**
 * Parse Gemini JSON into the bot's internal result shape (DB-compatible names).
 * imagePrompt is always empty — images come from fetcher.resolveArticleImage().
 */
export function parseAiResponse(aiText) {
  let parsed;
  try {
    parsed = JSON.parse(aiText);
  } catch (error) {
    throw new Error(`AI response was not valid JSON: ${error.message}`);
  }

  const titleUrdu = parsed.title_urdu ?? parsed.urduTitle ?? "";
  const bodyUrdu = parsed.body_urdu ?? parsed.article ?? "";
  const urduSummary = parsed.urdu_summary ?? parsed.urduSummary ?? "";
  const seoTitle = parsed.seo_title ?? parsed.seoTitle ?? "";
  const seoDescription = parsed.seo_description ?? parsed.seoDescription ?? "";
  let seoKeywords = parsed.seo_keywords ?? parsed.seoKeywords ?? "";
  if (Array.isArray(seoKeywords)) {
    seoKeywords = seoKeywords
      .filter((k) => typeof k === "string" && k.trim())
      .map((k) => k.replace(/^#/, "").trim())
      .join(", ");
  } else if (typeof seoKeywords === "string") {
    seoKeywords = seoKeywords
      .split(/[,|]+/)
      .map((k) => k.replace(/^#/, "").trim())
      .filter(Boolean)
      .join(", ");
  } else {
    seoKeywords = "";
  }
  const facebookPost = parsed.facebook_post ?? parsed.facebookPost ?? "";

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((tag) => typeof tag === "string" && tag.trim())
    : [];

  const category = typeof parsed.category === "string" ? parsed.category.trim() : "";

  const summary =
    typeof urduSummary === "string" ? urduSummary.trim() : "";
  const seoDesc =
    typeof seoDescription === "string" ? seoDescription.trim() : "";

  return {
    category,
    urduTitle: typeof titleUrdu === "string" ? titleUrdu.trim() : "",
    urduSummary: summary,
    seoTitle: typeof seoTitle === "string" ? seoTitle.trim() : "",
    // Never leave SEO description empty when we have a summary.
    seoDescription: seoDesc || summary.slice(0, 160),
    seoKeywords,
    article: typeof bodyUrdu === "string" ? bodyUrdu.trim() : "",
    hashtags: hashtags.join(" "),
    facebookPost: typeof facebookPost === "string" ? facebookPost.trim() : "",
    // Disabled — kept empty so older callers/DB columns stay safe.
    imagePrompt: ""
  };
}

/**
 * Strict validation: Urdu script + full body length (no image requirements).
 */
export function isValidAiResult(result) {
  if (!result?.urduTitle || !result?.urduSummary || !result?.article) {
    return false;
  }
  if (!looksLikeUrdu(result.urduTitle, 8)) return false;
  if (!looksLikeUrdu(result.urduSummary, 16)) return false;
  if (!looksLikeUrdu(result.article, 80)) return false;
  if (result.article.length < MIN_BODY_URDU_CHARS) return false;
  if (paragraphCount(result.article) < 2 && result.article.length < MIN_BODY_URDU_CHARS + 150) {
    return false;
  }
  return true;
}

function buildUserPrompt({ title, rawContent, description }) {
  // Editor Telegram multi-line bodies can be long (up to ~4k per message, often appended).
  const sourceText = (rawContent || description || "").trim().slice(0, 12000);

  return `Produce a complete Urdu news package for this story. Follow the system rules and JSON schema exactly.

ENGLISH HEADLINE:
${title}

SOURCE TEXT (English — use as factual basis for a FULL Urdu article in body_urdu):
${sourceText || "(No long source text available — expand carefully from the headline into 3–4 Urdu paragraphs.)"}

Remember:
- title_urdu + body_urdu + urdu_summary MUST be Arabic-script Urdu only.
- body_urdu = full article (3–4 paragraphs), NOT a short blurb.
- Do not invent image prompts or image URLs.`;
}

/**
 * @param {{ title: string, rawContent?: string, description?: string }} item
 * @param {string} model
 */
async function callGemini(item, model) {
  const prompt = buildUserPrompt(item);

  const response = await fetch(geminiGenerateUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 4096
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Gemini API (${model}) returned ${response.status}: ${response.statusText} ${errorBody}`.trim()
    );
  }

  const data = await response.json();

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked the request (${model}): ${blockReason}`);
  }

  const finishReason = data?.candidates?.[0]?.finishReason;
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error(
      `Gemini API response missing content (${model})${finishReason ? ` (finishReason=${finishReason})` : ""}`
    );
  }

  return content;
}

/**
 * Analyze one news item into Urdu content (no image generation).
 *
 * @param {{ title: string, rawContent?: string, description?: string }} item
 * @param {(level: string, message: string, meta?: object) => void} [log]
 */
export async function analyzeNews(item, log = () => {}) {
  if (!item?.title) {
    throw new Error("analyzeNews: item.title is required");
  }

  const models = getGeminiModels();
  let lastError;

  // Always start at primary (index 0) so quota reset returns to 3.5-flash-lite.
  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];

    for (let attempt = 1; attempt <= AI_MAX_RETRIES + 1; attempt++) {
      try {
        const aiText = await callGemini(item, model);
        const result = parseAiResponse(aiText);

        if (isValidAiResult(result)) {
          if (modelIndex > 0) {
            log("info", "Gemini fallback model succeeded", { model, title: item.title });
          }
          return result;
        }

        lastError = new Error(
          `AI response failed Urdu/full-article validation (titleUrduChars=${countUrduChars(result.urduTitle)}, bodyLen=${result.article?.length || 0})`
        );
        log("warn", `AI response validation failed (attempt ${attempt})`, {
          model,
          title: item.title,
          bodyLength: result.article?.length || 0,
          urduTitleChars: countUrduChars(result.urduTitle),
          urduBodyChars: countUrduChars(result.article)
        });
      } catch (error) {
        lastError = error;
        log("warn", `Gemini call failed (attempt ${attempt})`, {
          model,
          message: error.message
        });

        // Quota / rate-limit → try next model immediately (no more retries on this one).
        if (isGeminiQuotaOrRateLimitError(error) && modelIndex < models.length - 1) {
          log("warn", "Gemini quota/rate-limit — switching model", {
            from: model,
            to: models[modelIndex + 1]
          });
          break;
        }
      }

      if (attempt <= AI_MAX_RETRIES) {
        await sleep(AI_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}
