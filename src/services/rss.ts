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

const RSS_CACHE_DURATION = 3600000; // 1 hour
let cache: {
  timestamp: number;
  data: any;
} | null = null;

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
    // Check cache
    if (cache && Date.now() - cache.timestamp < RSS_CACHE_DURATION) {
      return cache.data;
    }

    console.log('Fetching podcast feed from:', url);
    
    // First try direct fetch to get raw XML
    let feed;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch RSS feed: ${response.status}`);
      }
      const xml = await response.text();
      feed = await parser.parseString(xml);
    } catch (fetchError) {
      console.error('Error with direct fetch, falling back to parseURL:', fetchError);
      feed = await parser.parseURL(url);
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
    cache = {
      timestamp: Date.now(),
      data: podcast
    };

    return podcast;
  } catch (error) {
    console.error('Error fetching podcast feed:', error);
    
    // Try to get more details about the error
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Return cached data if available
    if (cache) {
      console.log('Using cached podcast data');
      return cache.data;
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
