import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function analyzeNews(title) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Analyze this news headline and return EXACTLY in this format:

CATEGORY: Technology
URDU_TITLE: Urdu headline
URDU_SUMMARY: Two sentence Urdu summary
HASHTAGS: #News #Technology
FACEBOOK_POST: Complete Facebook post in Urdu
IMAGE_PROMPT: Professional AI image prompt

Headline:
${title}`
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
  );
}

async function run() {
  const feed = await parser.parseURL(
    "https://feeds.bbci.co.uk/news/rss.xml"
  );

  const item = feed.items[0];

  const { data: existing } = await supabase
    .from("news")
    .select("url")
    .eq("url", item.link);

  if (existing && existing.length > 0) {
    console.log("Already exists");
    return;
  }

  const aiText = await analyzeNews(item.title);
  console.log(aiText);
  console.log("AI RESPONSE:");

  const category =
    aiText.match(/CATEGORY:\s*(.*)/i)?.[1]?.trim() || "General";

  const urduTitle =
    aiText.match(/URDU_TITLE:\s*(.*)/i)?.[1]?.trim() || "";

  const urduSummary =
    aiText.match(/URDU_SUMMARY:\s*(.*)/i)?.[1]?.trim() || "";

  const hashtags =
    aiText.match(/HASHTAGS:\s*(.*)/i)?.[1]?.trim() || "";

  const facebookPost =
    aiText.match(/FACEBOOK_POST:\s*(.*)/i)?.[1]?.trim() || "";

  const imagePrompt =
    aiText.match(/IMAGE_PROMPT:\s*(.*)/i)?.[1]?.trim() || "";

  const { error } = await supabase
    .from("news")
    .insert({
      title: item.title,
      source: "BBC",
      url: item.link,
      category: category,
      urdu_title: urduTitle,
      urdu_summary: urduSummary,
      hashtags: hashtags,
      facebook_post: facebookPost,
      image_prompt: imagePrompt
    });

  if (error) {
    console.log(error);
  } else {
    console.log("News saved with full AI analysis");
  }
}

run();
