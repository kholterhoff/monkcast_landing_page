import rss from '@astrojs/rss';
import { fetchPodcastFeed, PODCAST_RSS_URL } from '../services/rss';
import type { Podcast, Episode } from '../types';

// Function to validate podcast data
function validatePodcastData(podcast: Podcast): boolean {
  return Boolean(
    podcast &&
    podcast.title &&
    podcast.episodes &&
    Array.isArray(podcast.episodes)
  );
}

// Define iTunes namespace
const xmlns = {
  'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
  'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
  'xmlns:googleplay': 'http://www.google.com/schemas/play-podcasts/1.0',
  'xmlns:atom': 'http://www.w3.org/2005/Atom'
};

export interface AstroContext {
  site?: string;
}

export async function GET(context: AstroContext) {
  // Force fresh data fetch for RSS feed
  console.log('Generating RSS feed with fresh data');

  // Add retry logic for more reliable feed generation
  let podcast: Podcast | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (!podcast && attempts < maxAttempts) {
    attempts++;
    try {
      podcast = await fetchPodcastFeed(PODCAST_RSS_URL) as Podcast;

      // Validate the podcast data
      if (!validatePodcastData(podcast)) {
        console.error(`Invalid podcast data received on attempt ${attempts}`);
        podcast = null;
        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
      }
    } catch (error) {
      console.error(`Error fetching podcast feed on attempt ${attempts}:`, error);
      if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
    }
  }

  if (!podcast) {
    throw new Error(`Failed to fetch valid podcast data after ${maxAttempts} attempts`);
  }

  const site = context.site || 'https://monkcast.com';

  // Create a simple, valid RSS feed
  const validEpisodes = podcast.episodes
    .filter((episode: Episode) => {
      return episode.title && episode.pubDate && episode.guid;
    })
    .slice(0, 50) // Limit to 50 most recent episodes
    .map((episode: Episode) => {
      const title = episode.title.trim();
      const description = (episode.summary || episode.contentSnippet || 'Episode description not available').trim();

      return {
        title,
        description,
        pubDate: new Date(episode.pubDate),
        link: episode.link || `${site}/episodes/${episode.guid}`,
        guid: episode.guid
      };
    });

  return rss({
    title: podcast.title || 'The MonkCast',
    description: podcast.description || 'Technology analysis and insights from the RedMonk team',
    site: site,
    items: validEpisodes
  });
}