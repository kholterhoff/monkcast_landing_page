import Parser from 'rss-parser';
import { format } from 'date-fns';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

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

// Persistent cover image cache — loaded from disk, written back after build
// Use process.cwd() (project root) instead of import.meta.url because Vite/Astro
// transforms modules during build, making import.meta.url point to a virtual location.
const CACHE_FILE = join(process.cwd(), 'src', 'data', 'cover-image-cache.json');
const coverImageCache = new Map();
let cacheModified = false;
const REDMONK_URL_PATTERN = /https?:\/\/redmonk\.com\/[^\s"'<>)]+/g;
const BROKEN_SHOW_NOTES_PATTERN =
  /href="https?:\/\/redmonk\.com\/videos\/"[^>]*>https?:\/\/redmonk\.com\/videos\/<\/a>\s*([a-z0-9-]+\/?)/i;

export function normalizeRedmonkUrl(url) {
  if (!url || typeof url !== 'string') return '';

  try {
    const normalized = new URL(url.trim());
    normalized.hash = '';

    if (/(^|\.)redmonk\.com$/i.test(normalized.hostname) && !normalized.pathname.endsWith('/')) {
      normalized.pathname = `${normalized.pathname}/`;
    }

    return normalized.toString();
  } catch {
    return url.trim();
  }
}

function isGenericVideosPage(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'redmonk.com' && parsedUrl.pathname.replace(/\/+$/, '') === '/videos';
  } catch {
    return false;
  }
}

function extractBrokenShowNotesUrl(text) {
  const match = text.match(BROKEN_SHOW_NOTES_PATTERN);
  if (!match || !match[1]) {
    return null;
  }

  return normalizeRedmonkUrl(`https://redmonk.com/videos/${match[1]}`);
}

function extractRedmonkUrlFromTexts(textsToSearch) {
  for (const text of textsToSearch) {
    const stitchedUrl = extractBrokenShowNotesUrl(text);
    if (stitchedUrl) {
      return stitchedUrl;
    }

    const matches = Array.from(text.matchAll(REDMONK_URL_PATTERN))
      .map(match => match[0] && match[0].replace(/(&quot;|&gt;|&lt;|[,;.!?])+$/, ''))
      .filter(Boolean)
      .map(value => normalizeRedmonkUrl(value))
      .filter(value => !isGenericVideosPage(value));

    if (matches.length > 0) {
      return matches[matches.length - 1];
    }
  }

  return null;
}

// Load persistent cache from disk on startup
try {
  const data = readFileSync(CACHE_FILE, 'utf8');
  const parsed = JSON.parse(data);
  for (const [key, value] of Object.entries(parsed)) {
    coverImageCache.set(normalizeRedmonkUrl(key), value);
  }
  console.log(`Loaded ${coverImageCache.size} cached cover images from disk`);
} catch {
  console.log('No existing cover image cache found, starting fresh');
}

// Save cache back to disk
export function persistCoverImageCache() {
  if (!cacheModified) {
    console.log('Cover image cache unchanged, skipping write');
    return;
  }
  try {
    const obj = Object.fromEntries(coverImageCache);
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
    console.log(`Persisted ${coverImageCache.size} cover image entries to disk`);
  } catch (error) {
    console.warn('Failed to persist cover image cache:', error);
  }
}

export async function extractCoverImageFromRedmonk(url) {
  if (!url) return null;
  const normalizedUrl = normalizeRedmonkUrl(url);

  // Check cache first (includes entries loaded from disk)
  if (coverImageCache.has(normalizedUrl)) {
    return coverImageCache.get(normalizedUrl);
  }

  // Skip live fetching in CI if env var is set
  if (process.env.SKIP_IMAGE_FETCH === 'true') {
    console.log(`Skipping image fetch in CI for: ${normalizedUrl}`);
    return null;
  }

  console.log(`Fetching cover image (not in cache): ${normalizedUrl}`);

  // Small delay between requests to avoid rate-limiting from RedMonk's server
  await new Promise(resolve => setTimeout(resolve, 200));

  try {
    const controller = new AbortController();
    const timeoutMs = process.env.CI === 'true' ? 5000 : 10000; // Shorter timeout in CI
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MonkCastBot/1.0)',
        'Accept': 'text/html'
      },
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to fetch RedMonk page (${response.status}): ${normalizedUrl}`);
      coverImageCache.set(normalizedUrl, null);
      cacheModified = true;
      return null;
    }

    const html = await response.text();

    // Try different image selectors in order of preference
    const selectors = [
      /<meta\s+property="og:image"\s+content="([^"]+)"/i,  // Open Graph image
      /<meta\s+content="([^"]+)"\s+property="og:image"/i,   // og:image with reversed attribute order
      /<img[^>]+class="[^"]*featured-image[^"]*"[^>]+src="([^"]+)"/i,  // Featured image
      /<div[^>]+class="[^"]*post-content[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i,  // First image in content
    ];

    for (const selector of selectors) {
      const match = html.match(selector);
      if (match && match[1] && !match[1].includes('statcounter')) {
        const imageUrl = match[1];
        coverImageCache.set(normalizedUrl, imageUrl);
        cacheModified = true;
        return imageUrl;
      }
    }

    // No image found
    console.warn(`No cover image found on RedMonk page: ${normalizedUrl}`);
    coverImageCache.set(normalizedUrl, null);
    cacheModified = true;
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching RedMonk cover image from ${normalizedUrl}: ${msg}`);
    // Don't cache timeouts/network errors — allow retry on next build
    if (msg.includes('abort') || msg.includes('timeout') || msg.includes('ECONNRESET')) {
      return null;
    }
    coverImageCache.set(normalizedUrl, null);
    cacheModified = true;
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
        const textsToSearch = [
          item.description,
          item.content,
          item.summary,
          item.contentSnippet,
        ].filter(Boolean);
        const redmonkUrl = extractRedmonkUrlFromTexts(textsToSearch);
        
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
