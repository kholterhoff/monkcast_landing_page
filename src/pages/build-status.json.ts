const RSS_URL = "https://api.riverside.fm/hosting/tBthkY3f.rss";

export async function GET() {
  let episodeCount = 0;
  const buildTimestamp = new Date().toISOString();

  try {
    // Count raw <item> tags in the RSS XML to match the same method
    // used by the scheduled function checker (netlify/functions/check-new-episodes.mts)
    const response = await fetch(RSS_URL);
    if (response.ok) {
      const xml = await response.text();
      const matches = xml.match(/<item>/g);
      episodeCount = matches ? matches.length : 0;
    }
  } catch (error) {
    console.warn("Failed to get episode count for build-status.json:", error);
  }

  const body = JSON.stringify({
    episodeCount,
    buildTimestamp,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
