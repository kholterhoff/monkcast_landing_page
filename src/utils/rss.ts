import { parse } from 'node-html-parser';

/**
 * Attempts to extract a cover image from a RedMonk blog post URL
 * @param url The RedMonk blog post URL
 * @returns The URL of the cover image, or null if not found
 */
export async function extractCoverImageFromRedmonk(url: string): Promise<string | null> {
  if (!url || !url.includes('redmonk.com')) {
    return null;
  }

  try {
    // Use a direct fetch with cache-busting
    const timestamp = Date.now();
    const response = await fetch(`${url}?_=${timestamp}`, {
      headers: {
        'User-Agent': 'MonkCast/1.0',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.warn(`Failed to fetch RedMonk post: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const root = parse(html);

    // Try to find the featured image
    const featuredImage = root.querySelector('.wp-post-image');
    if (featuredImage && featuredImage.getAttribute('src')) {
      return featuredImage.getAttribute('src') || null;
    }

    // Try to find any other large image in the content
    const contentImages = root.querySelectorAll('.entry-content img');
    if (contentImages.length > 0) {
      return contentImages[0].getAttribute('src') || null;
    }

    return null;
  } catch (error) {
    console.error('Error extracting cover image:', error);
    return null;
  }
}

/**
 * Formats a duration string into a more readable format
 * @param duration Duration string (e.g., "1:30:45" or "5400")
 * @returns Formatted duration string
 */
export function formatDuration(duration: string): string {
  if (!duration) return '';

  // If it's just a number (seconds)
  if (/^\d+$/.test(duration)) {
    const seconds = parseInt(duration, 10);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }

  // If it's already in HH:MM:SS format
  return duration;
}

/**
 * Direct fetch of the podcast RSS feed to bypass any caching issues
 * @param url The RSS feed URL
 * @returns The raw XML content
 */
export async function directFetchRSS(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MonkCast/1.0 RSS Reader',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      cache: 'no-store'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }
    
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}