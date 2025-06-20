import Parser from 'rss-parser';
import { format } from 'date-fns';
import { extractCoverImageFromRedmonk, formatDuration } from '../utils/rss';

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
  try {
    // Check cache - skip cache during build
    const isBuild = process.env.NODE_ENV === 'production';
    const cachedItem = rssCache.get(url);
    if (!isBuild && cachedItem && Date.now() - cachedItem.timestamp < RSS_CACHE_DURATION) {
      console.log('Using cached podcast data for:', url);
      return cachedItem.data;
    }
    
    console.log('Fetching fresh podcast data, isBuild:', isBuild);

    console.log('Fetching podcast feed from:', url);
    
    // First try direct fetch to get raw XML with improved fetch options
    let feed;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MonkCast/1.0 RSS Reader',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch RSS feed: ${response.status}`);
      }
      
      const xml = await response.text();
      feed = await parser.parseString(xml);
    } catch (fetchError) {
      console.error('Error with direct fetch, falling back to parseURL:', fetchError);
      try {
        feed = await parser.parseURL(url);
      } catch (parseError) {
        console.error('Error with parseURL fallback:', parseError);
        throw new Error(`Failed to fetch podcast feed: ${fetchError.message || 'Unknown error'}`);
      }
    }
    console.log('Successfully fetched feed:', feed.title);
    
    // Process the feed data
    const podcast = {
      title: feed.title,
      description: feed.description,
      link: feed.link,
      image: feed.image?.url || '',
      itunesAuthor: feed.itunes?.author || '',
      episodes: await Promise.all(feed.items.map(async item => {
        // Extract all RedMonk post URLs from content
        const redmonkUrl = item.content?.match(/https?:\/\/redmonk\.com\/blog\/[^\s"']+/)?.[0];
        
        // Try to get cover image from RedMonk post
        const coverImage = await extractCoverImageFromRedmonk(redmonkUrl || '');

        return {
          title: item.title || '',
          pubDate: item.pubDate || '',
          formattedDate: format(new Date(item.pubDate || Date.now()), 'MMMM d, yyyy'),
          duration: item.duration || '',
          summary: item.summary || item.contentSnippet || '',
          content: item.content || '',
          image: coverImage || item.image || feed.image?.url || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
          season: item.season || '',
          episodeNumber: item.episodeNumber || '',
          guid: item.guid || '',
          redmonkUrl: redmonkUrl || '',
          link: item.link || '',
          enclosure: normalizeEnclosure(item.enclosure)
        };
      }))
    };

    // Update cache
    rssCache.set(url, {
      timestamp: Date.now(),
      data: podcast
    });

    return podcast;
  } catch (error) {
    console.error('Error fetching podcast feed:', error);
    
    // Try to get more details about the error
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Return cached data if available
    const cachedItem = rssCache.get(url);
    if (cachedItem) {
      console.log('Using cached podcast data after error');
      return cachedItem.data;
    }
    
    console.log('Using fallback podcast data');
    // Fallback data
    return {
      title: 'The MonkCast',
      description: 'Technology analysis and insights from the RedMonk team',
      link: 'https://redmonk.com',
      image: 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
      itunesAuthor: 'RedMonk',
      episodes: []
    };
  }
}

export const PODCAST_RSS_URL = 'https://www.podserve.fm/series/rss/8338/the-monkcast.rss';
