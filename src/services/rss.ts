import Parser from 'rss-parser';
import { format } from 'date-fns';
import { extractCoverImageFromRedmonk } from '../utils/rss';

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
});

const RSS_CACHE_DURATION = 3600000; // 1 hour
let cache: {
  timestamp: number;
  data: any;
} | null = null;

export async function fetchPodcastFeed(url: string) {
  try {
    // Check cache
    if (cache && Date.now() - cache.timestamp < RSS_CACHE_DURATION) {
      return cache.data;
    }

    console.log('Fetching podcast feed from:', url);
    const feed = await parser.parseURL(url);
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
          image: coverImage || item.image || '',
          season: item.season || '',
          episodeNumber: item.episodeNumber || '',
          guid: item.guid || '',
          redmonkUrl: redmonkUrl || ''
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
    // Return cached data if available
    if (cache) {
      return cache.data;
    }
    
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
