import Parser from 'rss-parser';
import { format } from 'date-fns';
import { extractCoverImageFromRedmonk, formatDuration } from '../utils/rss.js';
import { stripHtml } from '../utils/sanitize.js';
import { 
  withRetry, 
  CircuitBreaker, 
  safeFetch, 
  createFallbackProvider,
  ExternalApiError,
  DEFAULT_RETRY_CONFIG,
  withApiErrorBoundary,
  ApiHealthMonitor
} from '../utils/errorBoundary.js';

const parser = new Parser({
  customFields: {
    item: [
      ['itunes:duration', 'duration'],
      ['itunes:image', 'image'],
      ['itunes:explicit', 'explicit'],
      ['itunes:summary', 'summary'],
      ['itunes:season', 'season'],
      ['itunes:episode', 'episodeNumber']
    ],
  },
  defaultRSS: 2.0,
});

// Set cache duration to 0 during build, 1 hour during runtime
const RSS_CACHE_DURATION = process.env.NODE_ENV === 'production' ? 0 : 3600000; // 0 for build, 1 hour for dev

interface CacheItem {
  timestamp: number;
  data: any;
}

// Use a Map for more efficient cache storage with multiple URLs
const rssCache = new Map<string, CacheItem>();

// Circuit breaker for RSS feed fetching
const rssCircuitBreaker = new CircuitBreaker(3, 30000); // 3 failures, 30s recovery

// Health monitor for API endpoints
const healthMonitor = new ApiHealthMonitor();

// Fallback data provider
const fallbackProvider = createFallbackProvider({
  title: 'The MonkCast',
  description: 'Technology analysis and insights from the RedMonk team',
  link: 'https://redmonk.com',
  image: 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
  itunesAuthor: 'RedMonk',
  episodes: []
});

// Default podcast data for complete failures
const DEFAULT_PODCAST_DATA = {
  title: 'The MonkCast',
  description: 'Technology analysis and insights from the RedMonk team',
  link: 'https://redmonk.com',
  image: 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
  itunesAuthor: 'RedMonk',
  episodes: []
};

// Helper function to ensure enclosure has proper format
function normalizeEnclosure(enclosure: any) {
  if (!enclosure) return null;
  
  return {
    url: enclosure.url || '',
    length: enclosure.length || 0,
    type: enclosure.type || 'audio/mpeg'
  };
}

export async function fetchPodcastFeed(url: string) {
  // Check cache first - skip cache during build
  const isBuild = process.env.NODE_ENV === 'production';
  const cachedItem = rssCache.get(url);
  if (!isBuild && cachedItem && Date.now() - cachedItem.timestamp < RSS_CACHE_DURATION) {
    console.log('Using cached podcast data for:', url);
    fallbackProvider.set(cachedItem.data);
    return cachedItem.data;
  }
  
  console.log('Fetching fresh podcast data, isBuild:', isBuild);

  // Use enhanced error boundary for the entire operation
  const result = await withApiErrorBoundary({
    operation: async () => {
      // Health check before attempting fetch
      const healthStatus = await healthMonitor.checkHealth(
        'rss-feed',
        async () => {
          const response = await safeFetch(url, { timeout: 5000 });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
      );

      if (!healthStatus.isHealthy && healthStatus.consecutiveFailures > 2) {
        console.warn('RSS feed health check failed, using cached/fallback data');
        throw new ExternalApiError(
          'RSS feed is unhealthy',
          undefined,
          'HEALTH_CHECK_FAILED'
        );
      }

      return await rssCircuitBreaker.execute(
        async () => {
          return await withRetry(
            async () => {
              console.log('Fetching podcast feed from:', url);
              
              // Try direct fetch first
              let feed;
              try {
                const response = await safeFetch(url, { timeout: 15000 });
                const xml = await response.text();
                feed = await parser.parseString(xml);
              } catch (fetchError) {
                console.warn('Direct fetch failed, trying parseURL fallback:', fetchError.message);
                // Fallback to parser's built-in URL fetching
                feed = await parser.parseURL(url);
              }
              
              if (!feed || !feed.title) {
                throw new ExternalApiError('Invalid RSS feed structure', undefined, 'INVALID_FEED');
              }
              
              console.log('Successfully fetched feed:', feed.title);
              return feed;
            },
            {
              ...DEFAULT_RETRY_CONFIG,
              maxAttempts: 3,
              baseDelay: 2000
            },
            'RSS Feed Fetch'
          );
        },
        () => {
          console.warn('Circuit breaker open, using fallback data');
          const fallback = fallbackProvider.get();
          return { ...fallback.data, episodes: [] }; // Return empty episodes for circuit breaker fallback
        }
      );
    },
    fallbackData: (() => {
      // Try cached data first
      const cachedItem = rssCache.get(url);
      if (cachedItem) {
        console.log('Using stale cached data as fallback');
        return cachedItem.data;
      }
      
      // Use default fallback
      console.log('Using default fallback podcast data');
      const fallback = fallbackProvider.get();
      return fallback.data;
    })(),
    context: 'Podcast Feed Fetch',
    onError: (error) => {
      console.error(`RSS Feed Error: ${error.message} (Status: ${error.status}, Code: ${error.code})`);
      
      // Log additional context for debugging
      console.error('Error details:', {
        url,
        timestamp: error.timestamp,
        circuitBreakerState: rssCircuitBreaker.getState()
      });
    },
    onFallback: (data, isStale) => {
      console.warn(`Using ${isStale ? 'stale' : 'fresh'} fallback data for podcast feed`);
      fallbackProvider.markStale();
    }
  });

  let feed = result.data;
  
  // If we got a valid feed, process episodes with error boundaries
  if (feed && feed.items) {
    const podcast = {
      title: feed.title || 'The MonkCast',
      description: feed.description || 'Technology analysis and insights from the RedMonk team',
      link: feed.link || 'https://redmonk.com',
      image: feed.image?.url || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
      itunesAuthor: feed.itunes?.author || 'RedMonk',
      episodes: await processEpisodesWithErrorBoundary(feed.items || [], feed)
    };

    // Update cache and fallback provider only if data is fresh
    if (!result.isStale) {
      rssCache.set(url, {
        timestamp: Date.now(),
        data: podcast
      });
      
      fallbackProvider.set(podcast);
    }
    
    return podcast;
  }

  // Return the fallback data as-is if feed processing failed
  return feed;
}

// Process episodes with individual error boundaries
async function processEpisodesWithErrorBoundary(items: any[], feed: any) {
  const episodes = [];
  
  for (const item of items) {
    try {
      const episode = await withRetry(
        async () => {
          // Extract RedMonk post URL with error handling
          let redmonkUrl = '';
          let coverImage = '';
          
          try {
            // Look for RedMonk URLs in description or content
            // The RSS feed has HTML-encoded descriptions with links
            const descriptionText = item.description || item.content || '';
            const linkText = item.link || '';
            
            // Try to find RedMonk URLs in the description
            const redmonkMatch = descriptionText.match(/https?:\/\/redmonk\.com\/[^\s"'<>)]+/);
            
            if (redmonkMatch) {
              redmonkUrl = redmonkMatch[0];
              // Clean up any trailing punctuation or HTML entities
              redmonkUrl = redmonkUrl.replace(/(&quot;|&gt;|&lt;|[,;.!?])+$/, '');
            }
            
            console.log(`Episode "${item.title}": RedMonk URL = ${redmonkUrl || 'not found'}`);
            
            if (redmonkUrl) {
              coverImage = await extractCoverImageFromRedmonk(redmonkUrl);
              console.log(`Episode "${item.title}": Cover image = ${coverImage || 'not found'}`);
            } else {
              console.log(`Episode "${item.title}": No RedMonk URL found in description`);
            }
          } catch (imageError) {
            console.warn('Failed to extract cover image:', imageError.message);
          }

          return {
            title: item.title || 'Untitled Episode',
            pubDate: item.pubDate || new Date().toISOString(),
            formattedDate: format(new Date(item.pubDate || Date.now()), 'MMMM d, yyyy'),
            duration: item.duration || '',
            summary: stripHtml(item.summary || item.contentSnippet || ''),
            content: item.content || '',
            contentSnippet: stripHtml(item.contentSnippet || ''),
            image: coverImage || item.image || feed.image?.url || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
            season: item.season || '',
            episodeNumber: item.episodeNumber || '',
            guid: item.guid || `episode-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            redmonkUrl,
            link: item.link || '',
            enclosure: normalizeEnclosure(item.enclosure)
          };
        },
        { maxAttempts: 2, baseDelay: 500 },
        `Episode processing: ${item.title || 'Unknown'}`
      );
      
      episodes.push(episode);
    } catch (episodeError) {
      console.warn(`Failed to process episode: ${item.title || 'Unknown'}`, episodeError.message);
      // Continue processing other episodes instead of failing completely
    }
  }
  
  return episodes;
}

export const PODCAST_RSS_URL = 'https://api.riverside.fm/hosting/tBthkY3f.rss';

// Export health monitoring functions
export function getRssHealthStatus() {
  return healthMonitor.getHealthStatus('rss-feed');
}

export function getAllApiHealthStatuses() {
  return healthMonitor.getAllHealthStatuses();
}

// Export circuit breaker status for monitoring
export function getCircuitBreakerStatus() {
  return {
    state: rssCircuitBreaker.getState(),
    timestamp: Date.now()
  };
}
