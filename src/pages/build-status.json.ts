import { fetchPodcastFeed, PODCAST_RSS_URL } from "../services/rss";
import type { Podcast } from "../types";

export async function GET() {
  let episodeCount = 0;
  const buildTimestamp = new Date().toISOString();

  try {
    const podcast = (await fetchPodcastFeed(PODCAST_RSS_URL)) as Podcast;
    episodeCount = podcast?.episodes?.length || 0;
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
