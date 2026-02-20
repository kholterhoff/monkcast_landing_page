import type { Config } from "@netlify/functions";

const RSS_URL = "https://api.riverside.fm/hosting/tBthkY3f.rss";

export default async (req: Request) => {
  const { next_run } = await req.json();
  console.log("Checking for new podcast episodes. Next run:", next_run);

  try {
    // Fetch the RSS feed
    const response = await fetch(RSS_URL, {
      headers: { "User-Agent": "MonkCast-EpisodeChecker/1.0" },
    });

    if (!response.ok) {
      console.error(`RSS fetch failed with status ${response.status}`);
      return;
    }

    const xml = await response.text();

    // Count episodes in the feed
    const itemMatches = xml.match(/<item>/g);
    const episodeCount = itemMatches ? itemMatches.length : 0;
    console.log(`RSS feed has ${episodeCount} episodes`);

    // Compare against last deployed build
    const siteUrl = process.env.URL || "https://monkcast.netlify.app";
    let lastKnownCount = 0;

    try {
      const statusResponse = await fetch(`${siteUrl}/build-status.json`);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        lastKnownCount = status.episodeCount || 0;
      }
    } catch {
      console.log("Could not fetch build status, assuming first run");
    }

    console.log(`Last known: ${lastKnownCount}, Current: ${episodeCount}`);

    // Trigger rebuild only if new episodes detected
    if (episodeCount > lastKnownCount) {
      console.log(
        `New episodes detected (${episodeCount} > ${lastKnownCount}). Triggering rebuild...`
      );

      const buildHookUrl = process.env.BUILD_HOOK_URL;
      if (!buildHookUrl) {
        console.error("BUILD_HOOK_URL environment variable is not set");
        return;
      }

      const buildResponse = await fetch(buildHookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_title: `New episode detected (${episodeCount} total)`,
        }),
      });

      console.log(`Build hook response: ${buildResponse.status}`);
    } else {
      console.log("No new episodes detected. Skipping rebuild.");
    }
  } catch (error) {
    console.error("Error checking for new episodes:", error);
  }
};

export const config: Config = {
  schedule: "0 */2 * * *",
};
