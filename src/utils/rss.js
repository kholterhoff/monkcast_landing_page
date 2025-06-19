import Parser from 'rss-parser';
import { format } from 'date-fns';

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

// Cache for cover images to avoid repeated fetches
const coverImageCache = new Map();

export async function extractCoverImageFromRedmonk(url) {
  if (!url) return null;
  
  // Check cache first
  if (coverImageCache.has(url)) {
    return coverImageCache.get(url);
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MonkCastBot/1.0)'
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`Failed to fetch RedMonk page: ${response.status}`);
      coverImageCache.set(url, null); // Cache the failure
      return null;
    }
    
    const html = await response.text();
    
    // Try different image selectors in order of preference
    const selectors = [
      /<meta\s+property="og:image"\s+content="([^"]+)"/i,  // Open Graph image
      /<img[^>]+class="[^"]*featured-image[^"]*"[^>]+src="([^"]+)"/i,  // Featured image
      /<div[^>]+class="[^"]*post-content[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i,  // First image in content
      /<img[^>]+src="([^"]+)"/i  // Any image
    ];
    
    for (const selector of selectors) {
      const match = html.match(selector);
      if (match && match[1]) {
        const imageUrl = match[1];
        // Store in cache
        coverImageCache.set(url, imageUrl);
        return imageUrl;
      }
    }
    
    // No image found
    coverImageCache.set(url, null);
    return null;
  } catch (error) {
    console.error('Error fetching RedMonk cover image:', error);
    coverImageCache.set(url, null); // Cache the failure
    return null;
  }
}

// This function is now deprecated - use the TypeScript version in services/rss.ts instead
export async function fetchPodcastFeed(url) {
  try {
    console.log('Fetching podcast feed from:', url);
    const feed = await parser.parseURL(url);
    console.log('Successfully fetched feed:', feed.title);
    
    // Process the feed data and fetch cover images
    const podcast = {
      title: feed.title,
      description: feed.description,
      link: feed.link,
      image: feed.image?.url || '',
      itunesAuthor: feed.itunes?.author || '',
      episodes: await Promise.all(feed.items.map(async item => {
        // Extract all RedMonk post URLs from content
        const redmonkUrlMatches = Array.from(item.content?.matchAll(/href="(https:\/\/redmonk\.com[^"]+)"/g) || []);
        // Use the last link if multiple are available
        const redmonkUrlMatch = redmonkUrlMatches.length > 0 ? redmonkUrlMatches[redmonkUrlMatches.length - 1] : null;
        const redmonkUrl = redmonkUrlMatch ? redmonkUrlMatch[1] : null;
        
        if (redmonkUrl) {
          console.log('Found RedMonk URL for episode:', item.title, redmonkUrl);
        }
        
        // Fetch cover image if RedMonk URL exists
        const coverImage = redmonkUrl ? await extractCoverImageFromRedmonk(redmonkUrl) : null;
        
        if (coverImage) {
          console.log('Found cover image for episode:', item.title, coverImage);
        }
        
        return {
          title: item.title,
          content: item.content,
          contentSnippet: item.contentSnippet,
          link: item.link,
          pubDate: item.pubDate,
          formattedDate: item.pubDate ? format(new Date(item.pubDate), 'MMMM d, yyyy') : '',
          enclosure: item.enclosure,
          duration: item.duration || '',
          image: coverImage || item.image?.href || feed.image?.url || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
          summary: item.summary || item.contentSnippet,
          season: item.season || '',
          episodeNumber: item.episodeNumber || '',
          guid: item.guid,
          redmonkUrl: redmonkUrl
        };
      }))
    };
    
    return podcast;
  } catch (error) {
    console.error('Error fetching podcast feed:', error);
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

// Cache for formatted durations
const durationCache = new Map();

export function formatDuration(duration) {
  if (!duration) return '';
  
  // Check cache first
  if (durationCache.has(duration)) {
    return durationCache.get(duration);
  }
  
  let result = '';
  
  if (duration.includes(':')) {
    result = duration;
  } else {
    const seconds = parseInt(duration, 10);
    if (isNaN(seconds)) return '';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      result = `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      result = `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }
  
  // Store in cache
  durationCache.set(duration, result);
  return result;
}