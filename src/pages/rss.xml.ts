import rss from '@astrojs/rss';
import { fetchPodcastFeed, PODCAST_RSS_URL, getRssHealthStatus, getCircuitBreakerStatus } from '../services/rss';
import { withApiErrorBoundary, ExternalApiError } from '../utils/errorBoundary';
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
  console.log('Generating RSS feed with enhanced error boundaries');

  const site = context.site || 'https://monkcast.com';

  // Use enhanced error boundary for RSS generation
  const result = await withApiErrorBoundary({
    operation: async () => {
      // Check system health before proceeding
      const healthStatus = getRssHealthStatus();
      const circuitStatus = getCircuitBreakerStatus();

      console.log('API Health Status:', healthStatus);
      console.log('Circuit Breaker Status:', circuitStatus);

      const podcast = await fetchPodcastFeed(PODCAST_RSS_URL) as Podcast;

      // Validate the podcast data
      if (!validatePodcastData(podcast)) {
        throw new ExternalApiError(
          'Invalid podcast data structure received',
          undefined,
          'INVALID_DATA_STRUCTURE'
        );
      }

      return podcast;
    },
    fallbackData: {
      title: 'The MonkCast',
      description: 'Technology analysis and insights from the RedMonk team',
      link: 'https://redmonk.com',
      image: 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
      itunesAuthor: 'RedMonk',
      episodes: []
    } as Podcast,
    retryConfig: {
      maxAttempts: 2,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2
    },
    context: 'RSS Feed Generation',
    onError: (error) => {
      console.error(`RSS Generation Error: ${error.message}`, {
        status: error.status,
        code: error.code,
        timestamp: error.timestamp
      });
    },
    onFallback: (data, isStale) => {
      console.warn(`RSS feed using ${isStale ? 'stale' : 'default'} fallback data`);
    }
  });

  const podcast = result.data;
  const isUsingFallback = result.isStale;

  // Create a simple, valid RSS feed with error-safe episode processing
  const validEpisodes = (podcast.episodes || [])
    .filter((episode: Episode) => {
      try {
        return episode && episode.title && episode.pubDate && episode.guid;
      } catch (error) {
        console.warn('Error validating episode:', error);
        return false;
      }
    })
    .slice(0, 50) // Limit to 50 most recent episodes
    .map((episode: Episode) => {
      try {
        const title = (episode.title || 'Untitled Episode').trim();
        const description = (
          episode.summary ||
          episode.contentSnippet ||
          'Episode description not available'
        ).trim();

        return {
          title,
          description,
          pubDate: new Date(episode.pubDate),
          link: episode.link || `${site}/episodes/${episode.guid}`,
          guid: episode.guid
        };
      } catch (error) {
        console.warn('Error processing episode for RSS:', error);
        return {
          title: 'Episode Processing Error',
          description: 'This episode could not be processed correctly.',
          pubDate: new Date(),
          link: `${site}/episodes/error`,
          guid: `error-${Date.now()}`
        };
      }
    });

  // Add fallback indicator to RSS if using fallback data
  const rssTitle = isUsingFallback
    ? `${podcast.title || 'The MonkCast'} (Limited Service)`
    : podcast.title || 'The MonkCast';

  const rssDescription = isUsingFallback
    ? `${podcast.description || 'Technology analysis and insights from the RedMonk team'} - Some episodes may be temporarily unavailable.`
    : podcast.description || 'Technology analysis and insights from the RedMonk team';

  try {
    return rss({
      title: rssTitle,
      description: rssDescription,
      site: site,
      items: validEpisodes,
      customData: isUsingFallback
        ? `<generator>MonkCast RSS Generator (Fallback Mode)</generator>`
        : `<generator>MonkCast RSS Generator</generator>`
    });
  } catch (rssError) {
    console.error('Error generating RSS XML:', rssError);

    // Return minimal RSS feed as last resort
    return rss({
      title: 'The MonkCast - Service Temporarily Limited',
      description: 'The MonkCast RSS feed is temporarily experiencing issues. Please try again later.',
      site: site,
      items: [],
      customData: `<generator>MonkCast RSS Generator (Emergency Mode)</generator>`
    });
  }
}