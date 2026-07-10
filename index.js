import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function translateToUrdu(title) {
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
                text: `Translate this news headline into professional Urdu and write a 2 sentence Urdu summary:\n\n${title}`
              }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "ترجمہ دستیاب نہیں"
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

  const urduText = await translateToUrdu(item.title);

  const lines = urduText.split("\n");

  const urduTitle = lines[0] || "";
  const urduSummary = lines.slice(1).join(" ");

  const { error } = await supabase
    .from("news")
    .insert({
      title: item.title,
      source: "BBC",
      url: item.link,
      urdu_title: urduTitle,
      urdu_summary: urduSummary
    });

  if (error) {
    console.log(error);
  } else {
    console.log("News saved with Urdu translation");
  }
}

run();
