import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function run() {
  const feed = await parser.parseURL(
    "https://feeds.bbci.co.uk/news/rss.xml"
  );

  const item = feed.items[0];

  const { data } = await supabase
    .from("news")
    .select("url")
    .eq("url", item.link);

  if (data && data.length > 0) {
    console.log("Already exists");
    return;
  }

  const { error } = await supabase
    .from("news")
    .insert({
      title: item.title,
      source: "BBC",
      url: item.link
    });

  if (error) {
    console.log(error);
  } else {
    console.log("News saved");
  }
}

run();
